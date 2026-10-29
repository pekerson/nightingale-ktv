mod vendor;

use std::{
    path::Path,
    sync::{Arc, Mutex, MutexGuard},
};

use app_core::{
    AnalysisQueue, AppConfig, CacheStats, LibraryMenuItems, LibrarySource, LoadSongsParams,
    PixabayVideoDownloaded, PlaybackQueue, PlaybackSession, PlaybackSessionStore, ProfileStore,
    SongTarget, SongsStore, UiLanguage, ensure_mp3_stems_ready_payload, load_lyrics_file,
    load_sidecar_lrc, save_lyrics_and_realign, search_lrclib_for_hash, shift_key_done_payload,
    shift_tempo_done_payload,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

pub trait CommandRuntime: Send + Sync + 'static {
    fn emit(&self, name: &str, payload: Value);

    fn set_monitor_gain(&self, _gain: f32) {}

    fn allow_directory(&self, _path: &Path) -> Result<(), String> {
        Ok(())
    }
}

#[derive(Clone)]
pub struct CommandState {
    runtime: Arc<dyn CommandRuntime>,
    config_access: Arc<Mutex<()>>,
    profile_access: Arc<Mutex<()>>,
    playback_queue: Arc<PlaybackQueue>,
    playback_sessions: Arc<PlaybackSessionStore>,
}

impl CommandState {
    pub fn new(runtime: Arc<dyn CommandRuntime>) -> Self {
        Self {
            runtime,
            config_access: Arc::new(Mutex::new(())),
            profile_access: Arc::new(Mutex::new(())),
            playback_queue: Arc::new(PlaybackQueue::default()),
            playback_sessions: Arc::new(PlaybackSessionStore::default()),
        }
    }
}

#[derive(Debug)]
pub struct CommandError {
    status: u16,
    message: String,
}

impl CommandError {
    fn bad_request(message: impl Into<String>) -> Self {
        Self {
            status: 400,
            message: message.into(),
        }
    }

    fn internal(message: impl Into<String>) -> Self {
        Self {
            status: 500,
            message: message.into(),
        }
    }

    pub fn status(&self) -> u16 {
        self.status
    }
}

impl std::fmt::Display for CommandError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for CommandError {}

type ApiError = CommandError;
type CmdResult = Result<Value, CommandError>;

#[derive(Clone)]
struct EventEmitter(Arc<dyn CommandRuntime>);

impl EventEmitter {
    fn emit<T: Serialize>(&self, name: &str, payload: &T) {
        if let Ok(value) = serde_json::to_value(payload) {
            self.0.emit(name, value);
        }
    }

    fn emit_value(&self, name: &str, payload: Value) {
        self.0.emit(name, payload);
    }

    fn allow_directory(&self, path: &Path) -> Result<(), String> {
        self.0.allow_directory(path)
    }
}

pub async fn dispatch(state: CommandState, name: &str, payload: Value) -> CmdResult {
    let events = EventEmitter(state.runtime.clone());

    match name {
        // ── Config ───────────────────────────────────────────────────────
        "load_config" => load_config_cmd(&state),
        "save_config" => save_config_cmd(&state, events, payload),
        "patch_config" => patch_config_cmd(&state, events, payload),
        "load_playlist_auto_analysis" => {
            let config = AppConfig::load();
            let result =
                app_core::playlist_auto_analysis_state(&config).map_err(ApiError::internal)?;
            serde_json::to_value(result).map_err(serde_err)
        }
        "set_playlist_auto_analysis" => set_playlist_auto_analysis_cmd(&state, events, payload),
        "set_mic_monitor_gain" => {
            #[derive(Deserialize)]
            struct Args {
                gain: f32,
            }
            let args: Args = deserialize(payload)?;
            if !args.gain.is_finite() || !(0.0..=2.0).contains(&args.gain) {
                return Err(ApiError::bad_request("invalid monitor gain"));
            }
            events.0.set_monitor_gain(args.gain);
            Ok(Value::Null)
        }
        "set_ui_language" => set_ui_language_cmd(&state, events, payload),
        "set_score_after_seek" => set_score_after_seek_cmd(&state, events, payload),

        // ── Backgrounds ─────────────────────────────────────────────────
        "add_custom_background_url" => add_custom_background_url_cmd(payload),
        "remove_custom_background" => remove_custom_background_cmd(payload),
        "resolve_custom_background_path" => resolve_custom_background_path_cmd(payload),
        "load_custom_background_shader" => load_custom_background_shader_cmd(payload),

        // ── Cache ────────────────────────────────────────────────────────
        "calculate_cache_stats" => {
            Ok(serde_json::to_value(CacheStats::calculate()).map_err(serde_err)?)
        }
        "clear_videos_command" => {
            app_core::clear_videos();
            Ok(Value::Null)
        }
        "clear_models_command" => {
            app_core::clear_models();
            Ok(Value::Null)
        }
        "clear_all" => {
            app_core::clear_models();
            app_core::clear_videos();
            Ok(Value::Null)
        }

        // ── Profile ──────────────────────────────────────────────────────
        "load_profiles" => {
            let _guard = lock_profiles(&state)?;
            let store =
                ProfileStore::load().map_err(|error| ApiError::internal(error.to_string()))?;
            Ok(serde_json::to_value(store).map_err(serde_err)?)
        }
        "create_profile" => {
            let args: NameArgs = deserialize(payload)?;
            let _guard = lock_profiles(&state)?;
            let mut store =
                ProfileStore::load().map_err(|error| ApiError::internal(error.to_string()))?;
            store
                .create_profile(args.name)
                .map_err(|error| ApiError::internal(error.to_string()))?;
            Ok(Value::Null)
        }
        "switch_profile" => {
            let args: NameArgs = deserialize(payload)?;
            let _guard = lock_profiles(&state)?;
            let mut store =
                ProfileStore::load().map_err(|error| ApiError::internal(error.to_string()))?;
            store
                .switch_profile(&args.name)
                .map_err(|error| ApiError::internal(error.to_string()))?;
            Ok(Value::Null)
        }
        "delete_profile" => {
            let args: NameArgs = deserialize(payload)?;
            let _guard = lock_profiles(&state)?;
            let mut store =
                ProfileStore::load().map_err(|error| ApiError::internal(error.to_string()))?;
            store
                .delete_profile(&args.name)
                .map_err(|error| ApiError::internal(error.to_string()))?;
            Ok(Value::Null)
        }
        "add_score" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                song_hash: String,
                score: u32,
                profile: Option<String>,
            }
            let args: Args = deserialize(payload)?;
            let _guard = lock_profiles(&state)?;
            let mut store =
                ProfileStore::load().map_err(|error| ApiError::internal(error.to_string()))?;
            store
                .add_score(&args.song_hash, args.score, args.profile.as_deref())
                .map_err(|error| ApiError::internal(error.to_string()))?;
            Ok(Value::Null)
        }

        // ── Playback queue ───────────────────────────────────────────────
        "load_playback_queue" => {
            let entries = state.playback_queue.entries().map_err(ApiError::internal)?;
            Ok(serde_json::to_value(entries).map_err(serde_err)?)
        }
        "add_playback_queue_entry" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                tempo: f64,
                key_offset: i32,
            }
            let args: Args = deserialize(payload)?;
            let entries = state
                .playback_queue
                .add(&args.file_hash, args.tempo, args.key_offset)
                .map_err(ApiError::bad_request)?;
            events.emit("playback-queue-changed", &entries);
            Ok(serde_json::to_value(entries).map_err(serde_err)?)
        }
        "move_playback_queue_entry" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                id: String,
                target_index: usize,
            }
            let args: Args = deserialize(payload)?;
            let entries = state
                .playback_queue
                .move_entry(&args.id, args.target_index)
                .map_err(ApiError::bad_request)?;
            events.emit("playback-queue-changed", &entries);
            Ok(serde_json::to_value(entries).map_err(serde_err)?)
        }
        "remove_playback_queue_entry" => {
            #[derive(Deserialize)]
            struct Args {
                id: String,
            }
            let args: Args = deserialize(payload)?;
            let entries = state
                .playback_queue
                .remove(&args.id)
                .map_err(ApiError::internal)?;
            events.emit("playback-queue-changed", &entries);
            Ok(serde_json::to_value(entries).map_err(serde_err)?)
        }
        "clear_playback_queue" => {
            let entries = state.playback_queue.clear().map_err(ApiError::internal)?;
            events.emit("playback-queue-changed", &entries);
            Ok(serde_json::to_value(entries).map_err(serde_err)?)
        }

        // ── Playback session ─────────────────────────────────────────────
        "load_playback_session" => {
            let session = state.playback_sessions.load().map_err(ApiError::internal)?;
            Ok(serde_json::to_value(session).map_err(serde_err)?)
        }
        "save_playback_session" => {
            #[derive(Deserialize)]
            struct Args {
                session: PlaybackSession,
            }
            let args: Args = deserialize(payload)?;
            let session = state
                .playback_sessions
                .save(args.session)
                .map_err(ApiError::internal)?;
            events.emit("playback-session-changed", &session);
            Ok(serde_json::to_value(session).map_err(serde_err)?)
        }

        // ── Scanner ──────────────────────────────────────────────────────
        "trigger_scan" => {
            app_core::start_scan();
            Ok(Value::Null)
        }
        "reconcile_cache" => {
            let summary = tokio::task::spawn_blocking(app_core::reconcile_cache)
                .await
                .map_err(blocking_task_err)?
                .map_err(ApiError::internal)?;
            Ok(serde_json::to_value(summary).map_err(serde_err)?)
        }
        "set_library_source" => {
            #[derive(Deserialize)]
            struct Args {
                source: LibrarySource,
            }
            let args: Args = deserialize(payload)?;
            let mut config = AppConfig::load();
            config.library_source = Some(args.source);
            config.last_folder = None;
            config.save();
            app_core::start_scan();
            Ok(serde_json::to_value(config).map_err(serde_err)?)
        }
        "clear_library_source" => {
            let mut config = AppConfig::load();
            config.library_source = None;
            config.last_folder = None;
            config.save();
            Ok(serde_json::to_value(config).map_err(serde_err)?)
        }
        "jellyfin_login" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                base_url: String,
                username: String,
                password: String,
            }
            let args: Args = deserialize(payload)?;
            let result =
                app_core::jellyfin_login(&args.base_url, &args.username, &args.password, None)
                    .map_err(|e| ApiError::bad_request(e.to_string()))?;
            Ok(serde_json::to_value(result).map_err(serde_err)?)
        }
        "jellyfin_ping" => {
            Ok(serde_json::to_value(app_core::jellyfin_ping_current()).map_err(serde_err)?)
        }
        "navidrome_login" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                base_url: String,
                username: String,
                password: String,
            }
            let args: Args = deserialize(payload)?;
            let result = app_core::navidrome_login(&args.base_url, &args.username, &args.password)
                .map_err(|e| ApiError::bad_request(e.to_string()))?;
            Ok(serde_json::to_value(result).map_err(serde_err)?)
        }
        "navidrome_ping" => {
            Ok(serde_json::to_value(app_core::navidrome_ping_current()).map_err(serde_err)?)
        }
        "plex_begin_pin" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                #[serde(default)]
                client_id: Option<String>,
            }
            let args: Args = deserialize(payload)?;
            let result =
                tokio::task::spawn_blocking(move || app_core::plex_begin_pin(args.client_id))
                    .await
                    .map_err(blocking_task_err)?
                    .map_err(|error| ApiError::bad_request(error.to_string()))?;
            Ok(serde_json::to_value(result).map_err(serde_err)?)
        }
        "plex_poll_pin" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                pin_id: String,
                client_id: String,
            }
            let args: Args = deserialize(payload)?;
            let result = tokio::task::spawn_blocking(move || {
                app_core::plex_poll_pin(&args.pin_id, &args.client_id)
            })
            .await
            .map_err(blocking_task_err)?
            .map_err(|error| ApiError::bad_request(error.to_string()))?;
            Ok(serde_json::to_value(result).map_err(serde_err)?)
        }
        "plex_manual_login" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                base_url: String,
                access_token: String,
                #[serde(default)]
                client_id: Option<String>,
            }
            let args: Args = deserialize(payload)?;
            let result = tokio::task::spawn_blocking(move || {
                app_core::plex_manual_login(&args.base_url, &args.access_token, args.client_id)
            })
            .await
            .map_err(blocking_task_err)?
            .map_err(|error| ApiError::bad_request(error.to_string()))?;
            Ok(serde_json::to_value(result).map_err(serde_err)?)
        }
        "plex_ping" => {
            let result = tokio::task::spawn_blocking(app_core::plex_ping_current)
                .await
                .map_err(blocking_task_err)?;
            Ok(serde_json::to_value(result).map_err(serde_err)?)
        }
        "load_songs" => {
            #[derive(Deserialize)]
            struct Args {
                params: LoadSongsParams,
            }
            let args: Args = deserialize(payload)?;
            Ok(serde_json::to_value(SongsStore::load(&args.params)).map_err(serde_err)?)
        }
        "load_songs_by_hashes" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hashes: Vec<String>,
            }
            let args: Args = deserialize(payload)?;
            Ok(
                serde_json::to_value(SongsStore::load_by_hashes(&args.file_hashes))
                    .map_err(serde_err)?,
            )
        }
        "load_songs_meta" => Ok(serde_json::to_value(SongsStore::load_meta()).map_err(serde_err)?),
        "load_analysis_queue" => {
            Ok(serde_json::to_value(AnalysisQueue::load()).map_err(serde_err)?)
        }
        "load_library_menu_items" => {
            let items: LibraryMenuItems = app_core::load_library_menu_items()
                .map_err(|e| ApiError::internal(e.to_string()))?;
            Ok(serde_json::to_value(items).map_err(serde_err)?)
        }

        // ── Analyzer ─────────────────────────────────────────────────────
        "enqueue" => {
            let args: SongTargetArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::enqueue(args.target).map_err(ApiError::internal)?,
            ))
        }
        "cancel_analysis" => {
            let args: SongTargetArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::cancel_analysis(args.target).map_err(ApiError::internal)?,
            ))
        }
        "delete_song_cache" => {
            let args: SongTargetArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::delete_cache(args.target).map_err(ApiError::internal)?,
            ))
        }
        "reanalyze_transcript" => {
            let args: SongTargetLanguageArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::reanalyze_transcript(args.target, args.language)
                    .map_err(ApiError::internal)?,
            ))
        }
        "reanalyze_full" => {
            let args: SongTargetArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::reanalyze_full(args.target).map_err(ApiError::internal)?,
            ))
        }
        "realign" => {
            let args: SongTargetLanguageArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::realign(args.target, args.language).map_err(ApiError::internal)?,
            ))
        }
        "reanalyze_force_transcribe" => {
            let args: SongTargetArgs = deserialize(payload)?;
            Ok(Value::from(
                app_core::reanalyze_force_transcribe(args.target).map_err(ApiError::internal)?,
            ))
        }
        "refresh_metadata" => {
            let args: SongTargetArgs = deserialize(payload)?;
            let count =
                tokio::task::spawn_blocking(move || app_core::refresh_metadata(args.target))
                    .await
                    .map_err(|e| ApiError::internal(e.to_string()))?
                    .map_err(ApiError::internal)?;
            Ok(Value::from(count))
        }
        "shift_key" => shift_key_cmd(events, payload),
        "shift_tempo" => shift_tempo_cmd(events, payload),

        // ── Lyrics ───────────────────────────────────────────────────────
        "load_lyrics" => {
            let args: FileHashArgs = deserialize(payload)?;
            Ok(serde_json::to_value(load_lyrics_file(&args.file_hash)).map_err(serde_err)?)
        }
        "get_song_intro_start" => {
            let args: FileHashArgs = deserialize(payload)?;
            let result =
                app_core::get_song_intro_start(&args.file_hash).map_err(ApiError::bad_request)?;
            serde_json::to_value(result).map_err(serde_err)
        }
        "set_song_intro_start" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                start_sec: Value,
            }
            let args: Args = deserialize(payload)?;
            let start_sec =
                if args.start_sec.is_null() {
                    None
                } else {
                    Some(args.start_sec.as_f64().ok_or_else(|| {
                        ApiError::bad_request("startSec must be a number or null")
                    })?)
                };
            let result = app_core::set_song_intro_start(&args.file_hash, start_sec)
                .map_err(ApiError::bad_request)?;
            events.emit_value(
                "song-intro-start-changed",
                serde_json::json!({"file_hash": args.file_hash}),
            );
            serde_json::to_value(result).map_err(serde_err)
        }
        "get_song_mv" => {
            let args: FileHashArgs = deserialize(payload)?;
            let result = app_core::get_song_mv(&args.file_hash).map_err(ApiError::bad_request)?;
            serde_json::to_value(result).map_err(serde_err)
        }
        "set_song_mv" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                path: Value,
            }
            let args: Args = deserialize(payload)?;
            let path = if args.path.is_null() {
                None
            } else {
                Some(args.path.as_str().ok_or_else(|| {
                    ApiError::bad_request("path must be a video file path or null")
                })?)
            };
            let result =
                app_core::set_song_mv(&args.file_hash, path).map_err(ApiError::bad_request)?;
            events.emit_value(
                "song-mv-changed",
                serde_json::json!({"file_hash": args.file_hash}),
            );
            serde_json::to_value(result).map_err(serde_err)
        }
        "set_song_mv_enabled" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                enabled: bool,
            }
            let args: Args = deserialize(payload)?;
            let result = app_core::set_song_mv_enabled(&args.file_hash, args.enabled)
                .map_err(ApiError::bad_request)?;
            events.emit_value(
                "song-mv-changed",
                serde_json::json!({"file_hash": args.file_hash}),
            );
            serde_json::to_value(result).map_err(serde_err)
        }
        "search_lrclib_lyrics" => {
            let args: FileHashArgs = deserialize(payload)?;
            let candidates =
                tokio::task::spawn_blocking(move || search_lrclib_for_hash(&args.file_hash))
                    .await
                    .map_err(blocking_task_err)?;
            Ok(serde_json::to_value(candidates).map_err(serde_err)?)
        }
        "save_lyrics" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                lines: Vec<String>,
            }
            let args: Args = deserialize(payload)?;
            save_lyrics_and_realign(&args.file_hash, args.lines).map_err(ApiError::bad_request)?;
            Ok(Value::Null)
        }
        "provide_lrc" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                lrc_text: String,
                separate_stems: bool,
            }
            let args: Args = deserialize(payload)?;
            app_core::provide_lrc(&args.file_hash, &args.lrc_text, args.separate_stems)
                .map_err(ApiError::bad_request)?;
            Ok(Value::Null)
        }
        "apply_timed_lyrics" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                lrc_text: String,
            }
            let args: Args = deserialize(payload)?;
            app_core::apply_timed_lyrics(&args.file_hash, &args.lrc_text)
                .map_err(ApiError::bad_request)?;
            Ok(Value::Null)
        }
        "align_lrc_lyrics" => {
            #[derive(Deserialize)]
            #[serde(rename_all = "camelCase")]
            struct Args {
                file_hash: String,
                lrc_text: String,
            }
            let args: Args = deserialize(payload)?;
            app_core::align_lrc_lyrics(&args.file_hash, &args.lrc_text)
                .map_err(ApiError::bad_request)?;
            Ok(Value::Null)
        }
        "load_sidecar_lrc" => {
            let args: FileHashArgs = deserialize(payload)?;
            let sidecar = tokio::task::spawn_blocking(move || load_sidecar_lrc(&args.file_hash))
                .await
                .map_err(blocking_task_err)?;
            Ok(serde_json::to_value(sidecar).map_err(serde_err)?)
        }

        // ── Playback ─────────────────────────────────────────────────────
        "load_transcript" => {
            let args: FileHashArgs = deserialize(payload)?;
            app_core::load_transcript(&args.file_hash)
                .map_err(|e| ApiError::internal(e.to_string()))
        }
        "get_audio_paths" => {
            let args: FileHashArgs = deserialize(payload)?;
            Ok(
                serde_json::to_value(app_core::get_audio_paths(&args.file_hash))
                    .map_err(serde_err)?,
            )
        }
        "ensure_mp3_stems" => ensure_mp3_stems_cmd(events, payload),
        "ensure_playable_source_video" => {
            let args: FileHashArgs = deserialize(payload)?;
            let path = app_core::ensure_playable_source_video(&args.file_hash)
                .ok()
                .flatten();
            Ok(serde_json::to_value(path).map_err(serde_err)?)
        }
        "ensure_playable_associated_mv" => {
            let args: FileHashArgs = deserialize(payload)?;
            let path = tokio::task::spawn_blocking(move || {
                app_core::ensure_playable_associated_mv(&args.file_hash)
            })
            .await
            .map_err(blocking_task_err)?
            .map_err(|error| ApiError::internal(error.to_string()))?;
            serde_json::to_value(path).map_err(serde_err)
        }
        "fetch_pixabay_videos" => fetch_pixabay_videos_cmd(events, payload),

        // ── Vendor ───────────────────────────────────────────────────────
        "is_ready" => Ok(Value::Bool(app_core::is_ready())),
        "trigger_setup" => vendor::trigger_setup(events, payload),

        _ => Err(CommandError {
            status: 404,
            message: format!("unknown command {name}"),
        }),
    }
}

fn serde_err(e: serde_json::Error) -> ApiError {
    ApiError::internal(format!("serialise: {e}"))
}

fn blocking_task_err(error: tokio::task::JoinError) -> ApiError {
    ApiError::internal(format!("blocking command failed: {error}"))
}

fn deserialize<T: for<'de> Deserialize<'de>>(value: Value) -> Result<T, ApiError> {
    serde_json::from_value(value).map_err(|e| ApiError::bad_request(format!("invalid args: {e}")))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NameArgs {
    name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileHashArgs {
    file_hash: String,
}

#[derive(Deserialize)]
struct SongTargetArgs {
    target: SongTarget,
}

#[derive(Deserialize)]
struct SongTargetLanguageArgs {
    target: SongTarget,
    #[serde(default)]
    language: Option<String>,
}

#[derive(Deserialize)]
struct SaveConfigArgs {
    config: AppConfig,
}

#[derive(Deserialize)]
struct PatchConfigArgs {
    patch: serde_json::Map<String, Value>,
}

fn validate_config_value(key: &str, value: &Value) -> Result<(), CommandError> {
    if value.is_null() {
        return Ok(());
    }
    if key == "audio_outputs" {
        let routes: Vec<app_core::AudioOutputRoute> = serde_json::from_value(value.clone())
            .map_err(|_| ApiError::bad_request("invalid audio output routes"))?;
        if routes.is_empty() || routes.len() > 2 {
            return Err(ApiError::bad_request("select one or two speaker outputs"));
        }
        let mut ids = std::collections::HashSet::new();
        for route in &routes {
            if route.device_id.len() > 2048
                || route.device_id.contains('\0')
                || matches!(route.device_id.as_str(), "default" | "communications")
                || (routes.len() == 2 && route.device_id.is_empty())
                || !ids.insert(&route.device_id)
            {
                return Err(ApiError::bad_request(
                    "select distinct explicit devices for two speaker outputs",
                ));
            }
        }
    }
    let bounds = match key {
        "app_font_size" => Some((12.0, 24.0)),
        "playback_progress_scale" | "playback_status_scale" | "playback_controls_scale" => {
            Some((0.5, 2.0))
        }
        "queue_auto_advance_delay_sec" => Some((1.0, 60.0)),
        "pitch_graph_window_sec" => Some((4.0, 60.0)),
        "lyrics_offset_x" | "lyrics_offset_y" | "pitch_graph_offset_x" | "pitch_graph_offset_y" => {
            Some((-100.0, 100.0))
        }
        "pitch_graph_scale" => Some((0.5, 5.0)),
        "instrumental_volume" => Some((0.0, 1.0)),
        "replay_gain_preamp_db" => Some((0.0, 10.0)),
        _ => None,
    };
    let positions = match key {
        "pitch_graph_horizontal_position" => Some(["left", "center", "right"]),
        "pitch_graph_vertical_position" => Some(["top", "center", "bottom"]),
        _ => None,
    };
    if let Some(allowed) = positions
        && !value
            .as_str()
            .is_some_and(|position| allowed.contains(&position))
    {
        return Err(ApiError::bad_request(format!("invalid {key}")));
    }
    if key == "shortcut_bindings" {
        let bindings: std::collections::HashMap<String, String> =
            serde_json::from_value(value.clone())
                .map_err(|_| ApiError::bad_request("invalid shortcut bindings"))?;
        if bindings.len() > 64
            || bindings.iter().any(|(action, binding)| {
                action.len() > 64 || binding.len() > 100 || binding.chars().any(char::is_control)
            })
        {
            return Err(ApiError::bad_request("shortcut bindings exceed limits"));
        }
    }
    if let Some((minimum, maximum)) = bounds {
        let number = value
            .as_f64()
            .ok_or_else(|| ApiError::bad_request(format!("invalid {key}")))?;
        if !number.is_finite() || number < minimum || number > maximum {
            return Err(ApiError::bad_request(format!("out of range: {key}")));
        }
    }
    Ok(())
}

fn patch_config_cmd(state: &CommandState, events: EventEmitter, payload: Value) -> CmdResult {
    let PatchConfigArgs { patch } = deserialize(payload)?;
    let guard = state
        .config_access
        .lock()
        .map_err(|error| ApiError::internal(format!("configuration lock failed: {error}")))?;
    let current = AppConfig::load();
    let was_auto_analyze = current.auto_analyze();
    let Value::Object(mut values) = serde_json::to_value(current).map_err(serde_err)? else {
        return Err(ApiError::internal("invalid configuration"));
    };
    for (key, value) in patch {
        if !values.contains_key(&key)
            || matches!(
                key.as_str(),
                "desktop_window" | "playback_window" | "playlist_auto_analyze"
            )
        {
            return Err(ApiError::bad_request(format!("unsupported setting: {key}")));
        }
        validate_config_value(&key, &value)?;
        values.insert(key, value);
    }
    let config: AppConfig = deserialize(Value::Object(values))?;
    config
        .try_save()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(guard);
    events.emit_value("config-changed", Value::Null);
    events.0.set_monitor_gain(config.mic_monitor_gain());
    if config.auto_analyze() && !was_auto_analyze {
        app_core::enqueue_automatic_analysis().map_err(ApiError::internal)?;
    }
    serde_json::to_value(config).map_err(serde_err)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PlaylistAutoAnalysisArgs {
    source_key: String,
    playlist_id: String,
    enabled: Option<bool>,
}

fn set_playlist_auto_analysis_cmd(
    state: &CommandState,
    events: EventEmitter,
    payload: Value,
) -> CmdResult {
    let args: PlaylistAutoAnalysisArgs = deserialize(payload)?;
    let guard = state
        .config_access
        .lock()
        .map_err(|error| ApiError::internal(format!("configuration lock failed: {error}")))?;
    let mut config = AppConfig::load();
    app_core::set_playlist_auto_analysis(
        &mut config,
        &args.source_key,
        &args.playlist_id,
        args.enabled,
    )
    .map_err(ApiError::bad_request)?;
    config
        .try_save()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    let result = app_core::playlist_auto_analysis_state(&config).map_err(ApiError::internal)?;
    drop(guard);
    events.emit_value("config-changed", Value::Null);
    let queued_count =
        app_core::enqueue_automatic_analysis_for_playlist(&args.source_key, &args.playlist_id)
            .map_err(|error| {
                ApiError::internal(format!(
                    "Playlist preference saved, but automatic analysis could not start: {error}"
                ))
            })?;
    let mut response = serde_json::to_value(result).map_err(serde_err)?;
    response["queuedCount"] = queued_count.into();
    response["syncPending"] = app_core::automatic_analysis_sync_pending().into();
    Ok(response)
}

fn lock_profiles(state: &CommandState) -> Result<MutexGuard<'_, ()>, ApiError> {
    state
        .profile_access
        .lock()
        .map_err(|error| ApiError::internal(format!("profile lock failed: {error}")))
}

fn load_config_cmd(state: &CommandState) -> CmdResult {
    let _guard = state
        .config_access
        .lock()
        .map_err(|error| ApiError::internal(format!("configuration lock failed: {error}")))?;
    serde_json::to_value(AppConfig::load()).map_err(serde_err)
}

#[derive(Deserialize)]
struct SetUiLanguageArgs {
    language: UiLanguage,
}

fn set_ui_language_cmd(state: &CommandState, events: EventEmitter, payload: Value) -> CmdResult {
    let SetUiLanguageArgs { language } = deserialize(payload)?;
    let guard = state
        .config_access
        .lock()
        .map_err(|error| ApiError::internal(format!("configuration lock failed: {error}")))?;
    let mut config = AppConfig::load();
    config.ui_language = Some(language);
    config
        .try_save()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(guard);
    events.emit_value("config-changed", Value::Null);
    serde_json::to_value(config).map_err(serde_err)
}

#[derive(Deserialize)]
struct SetScoreAfterSeekArgs {
    enabled: bool,
}

fn set_score_after_seek_cmd(
    state: &CommandState,
    events: EventEmitter,
    payload: Value,
) -> CmdResult {
    let SetScoreAfterSeekArgs { enabled } = deserialize(payload)?;
    let guard = state
        .config_access
        .lock()
        .map_err(|error| ApiError::internal(format!("configuration lock failed: {error}")))?;
    let mut config = AppConfig::load();
    config.score_after_seek = Some(enabled);
    config
        .try_save()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(guard);
    events.emit_value("config-changed", Value::Null);
    serde_json::to_value(config).map_err(serde_err)
}

fn save_config_cmd(state: &CommandState, events: EventEmitter, payload: Value) -> CmdResult {
    let SaveConfigArgs { mut config } = deserialize(payload)?;
    let guard = state
        .config_access
        .lock()
        .map_err(|error| ApiError::internal(format!("configuration lock failed: {error}")))?;
    let current = AppConfig::load();
    let was_auto_analyze = current.auto_analyze();
    config.ui_language = current.ui_language;
    config.score_after_seek = current.score_after_seek;
    config.instrumental_volume = current.instrumental_volume;
    config.guide_volume = current.guide_volume;
    config.replay_gain_enabled = current.replay_gain_enabled;
    config.replay_gain_preamp_db = current.replay_gain_preamp_db;
    config.mic_monitor_gain = current.mic_monitor_gain;
    config.audio_outputs = current.audio_outputs;
    config.app_font_size = current.app_font_size;
    config.playback_progress_scale = current.playback_progress_scale;
    config.playback_status_scale = current.playback_status_scale;
    config.playback_controls_scale = current.playback_controls_scale;
    config.pitch_graph_horizontal_position = current.pitch_graph_horizontal_position;
    config.pitch_graph_vertical_position = current.pitch_graph_vertical_position;
    config.shortcut_bindings = current.shortcut_bindings;
    config.playlist_auto_analyze = current.playlist_auto_analyze;
    config.queue_auto_advance = current.queue_auto_advance;
    config.queue_auto_advance_delay_sec = current.queue_auto_advance_delay_sec;
    config.lyrics_offset_x = current.lyrics_offset_x;
    config.lyrics_offset_y = current.lyrics_offset_y;
    config.pitch_graph_offset_x = current.pitch_graph_offset_x;
    config.pitch_graph_offset_y = current.pitch_graph_offset_y;
    config.pitch_graph_window_sec = current.pitch_graph_window_sec;
    config.desktop_window = current.desktop_window;
    config.playback_window = current.playback_window;
    config
        .try_save()
        .map_err(|error| ApiError::internal(error.to_string()))?;
    drop(guard);
    events.emit_value("config-changed", Value::Null);
    events.0.set_monitor_gain(config.mic_monitor_gain());
    if config.auto_analyze() && !was_auto_analyze {
        app_core::enqueue_automatic_analysis().map_err(ApiError::internal)?;
    }
    serde_json::to_value(config).map_err(serde_err)
}

#[derive(Deserialize)]
struct AddCustomBackgroundUrlArgs {
    name: String,
    url: String,
}

fn add_custom_background_url_cmd(payload: Value) -> CmdResult {
    let args: AddCustomBackgroundUrlArgs = deserialize(payload)?;
    let config =
        app_core::add_custom_background_url(args.name, args.url).map_err(ApiError::bad_request)?;
    serde_json::to_value(config).map_err(serde_err)
}

#[derive(Deserialize)]
struct CustomBackgroundIdArgs {
    id: String,
}

fn remove_custom_background_cmd(payload: Value) -> CmdResult {
    let args: CustomBackgroundIdArgs = deserialize(payload)?;
    let config = app_core::remove_custom_background(&args.id).map_err(ApiError::bad_request)?;
    serde_json::to_value(config).map_err(serde_err)
}

fn resolve_custom_background_path_cmd(payload: Value) -> CmdResult {
    let args: CustomBackgroundIdArgs = deserialize(payload)?;
    let path = app_core::resolve_custom_background_path(&args.id).map_err(ApiError::bad_request)?;
    serde_json::to_value(path).map_err(serde_err)
}

fn load_custom_background_shader_cmd(payload: Value) -> CmdResult {
    let args: CustomBackgroundIdArgs = deserialize(payload)?;
    let source =
        app_core::load_custom_background_shader(&args.id).map_err(ApiError::bad_request)?;
    serde_json::to_value(source).map_err(serde_err)
}

fn shift_key_cmd(events: EventEmitter, payload: Value) -> CmdResult {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Args {
        file_hash: String,
        key: String,
        pitch_ratio: f64,
        key_offset: i32,
    }
    let args: Args = deserialize(payload)?;
    std::thread::spawn(move || {
        let payload =
            shift_key_done_payload(args.file_hash, args.key, args.pitch_ratio, args.key_offset);
        events.emit("shift-key-done", &payload);
    });
    Ok(Value::Null)
}

fn shift_tempo_cmd(events: EventEmitter, payload: Value) -> CmdResult {
    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Args {
        file_hash: String,
        tempo: f64,
    }
    let args: Args = deserialize(payload)?;
    std::thread::spawn(move || {
        let payload = shift_tempo_done_payload(args.file_hash, args.tempo);
        events.emit("shift-tempo-done", &payload);
    });
    Ok(Value::Null)
}

fn ensure_mp3_stems_cmd(events: EventEmitter, payload: Value) -> CmdResult {
    let args: FileHashArgs = deserialize(payload)?;
    std::thread::spawn(move || {
        events.emit(
            "stems-ready",
            &ensure_mp3_stems_ready_payload(args.file_hash),
        );
    });
    Ok(Value::Null)
}

fn fetch_pixabay_videos_cmd(events: EventEmitter, payload: Value) -> CmdResult {
    #[derive(Deserialize)]
    struct Args {
        flavor: String,
    }
    let args: Args = deserialize(payload)?;
    let cached = app_core::get_cached_pixabay_videos(&args.flavor);

    let flavor_for_thread = args.flavor.clone();
    let events_clone = events.clone();
    std::thread::spawn(move || {
        let flavor_for_emit = flavor_for_thread.clone();
        app_core::download_pixabay_videos(&flavor_for_thread, move |path, evicted_path| {
            events_clone.emit(
                "pixabay-video-downloaded",
                &PixabayVideoDownloaded::new(flavor_for_emit.clone(), path, evicted_path),
            );
        });
    });

    Ok(json!(cached))
}
