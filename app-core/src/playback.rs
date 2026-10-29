use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};

use rand::prelude::{IndexedRandom, SliceRandom};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tracing::{info, warn};
use ts_rs::TS;

use crate::cache::{CacheDir, normalize_tempo, videos_dir};
use crate::error::NightingaleError;
use crate::library_db;
use crate::replay_gain::{self, ReplayGain};
use crate::song::{Song, SongOrigin};
use crate::vendor::{ffmpeg_path, silent_command};

#[derive(Debug, Clone, Serialize)]
pub struct AudioPaths {
    pub instrumental: String,
    /// `None` for LRC-provided songs played without stem separation: playback
    /// uses the original mix as the instrumental and hides the guide control.
    pub vocals: Option<String>,
    pub replay_gain_db: Option<f64>,
    pub replay_peak: Option<f64>,
}

fn audio_paths(
    instrumental: String,
    vocals: Option<String>,
    replay: Option<ReplayGain>,
) -> AudioPaths {
    AudioPaths {
        instrumental,
        vocals,
        replay_gain_db: replay.map(|value| value.gain_db),
        replay_peak: replay.and_then(|value| value.peak),
    }
}

#[derive(Debug, Clone)]
pub struct ShiftResult {
    pub key: String,
    pub tempo: f64,
}

#[derive(Debug, Clone, Serialize, TS)]
#[ts(export)]
pub struct ShiftDone {
    pub file_hash: String,
    pub key: Option<String>,
    pub tempo: Option<f64>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StemsReady {
    pub file_hash: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct PixabayVideoDownloaded {
    pub flavor: String,
    pub path: String,
    pub evicted_path: Option<String>,
}

impl PixabayVideoDownloaded {
    pub fn new(flavor: String, path: String, evicted_path: Option<String>) -> Self {
        Self {
            flavor,
            path,
            evicted_path,
        }
    }
}

pub fn load_transcript(file_hash: &str) -> Result<Value, NightingaleError> {
    let cache = CacheDir::new();
    let path = resolve_transcript_path(&cache, file_hash);
    let data = std::fs::read_to_string(&path)?;
    let value = serde_json::from_str(&data)?;
    Ok(value)
}

fn resolve_effective_key_tempo(song: &Song) -> Option<(String, f64)> {
    let key = song.override_key.as_ref().or(song.key.as_ref())?.clone();
    Some((key, normalize_tempo(song.tempo)))
}

fn is_base_original_selection(song: &Song, key: &str, tempo: f64) -> bool {
    song.key.as_deref() == Some(key) && normalize_tempo(tempo) == 1.0
}

fn resolve_transcript_path(cache: &CacheDir, file_hash: &str) -> PathBuf {
    if let Some(song) = library_db::load_song_by_hash(file_hash).ok().flatten()
        && let Some((key, tempo)) = resolve_effective_key_tempo(&song)
    {
        if normalize_tempo(tempo) == 1.0 {
            return cache.transcript_path(file_hash);
        }
        let variant = cache.variant_transcript_path(file_hash, tempo);
        if variant.is_file() {
            return variant;
        }
        // Saving lyrics drops tempo transcripts but keeps the stretched stems,
        // so rebuild the variant instead of serving unscaled timings.
        match write_tempo_transcript(cache, file_hash, &key, tempo) {
            Ok(path) => return path,
            Err(e) => warn!("[playback] Failed to build tempo {tempo} transcript: {e}"),
        }
    }
    cache.transcript_path(file_hash)
}

/// Resolve the on-disk original media for a song, materializing remote sources
/// on demand. Used for LRC-provided songs played without stem separation.
fn resolve_original_media(song: &Song, cache: &CacheDir) -> String {
    if matches!(song.origin, SongOrigin::LocalFile) {
        return song.path.to_string_lossy().into_owned();
    }
    match crate::source::active_source() {
        Ok(Some(source)) => match source.ensure_local_media(song, cache) {
            Ok(path) => path.to_string_lossy().into_owned(),
            Err(e) => {
                warn!("[playback] Failed to materialize original media: {e}");
                song.path.to_string_lossy().into_owned()
            }
        },
        _ => song.path.to_string_lossy().into_owned(),
    }
}

fn source_replay_gain(song: &Song) -> Option<ReplayGain> {
    let source = song
        .usdx
        .as_ref()
        .map_or(song.path.as_path(), |bundle| bundle.audio.as_path());
    // Do not fetch remote originals solely for metadata when playable stems
    // already exist. A missing/unreadable source simply has no ReplayGain.
    if !source.is_file() {
        return None;
    }
    replay_gain::read(source)
}

pub fn get_audio_paths(file_hash: &str) -> AudioPaths {
    let cache = CacheDir::new();
    let song = library_db::load_song_by_hash(file_hash).ok().flatten();
    let replay = song.as_ref().and_then(source_replay_gain);
    if let Some(song) = song {
        if song.no_stems {
            let tempo = normalize_tempo(song.tempo);
            if let Some(key) = song.override_key.as_ref().or(song.key.as_ref())
                && !is_base_original_selection(&song, key, tempo)
            {
                let variant = cache.variant_instrumental_path(file_hash, key, tempo);
                if variant.is_file() {
                    return audio_paths(variant.to_string_lossy().into_owned(), None, replay);
                }
            }
            let original = resolve_original_media(&song, &cache);
            let replay = replay.or_else(|| replay_gain::read(Path::new(&original)));
            return audio_paths(original, None, replay);
        }

        if let Some(bundle) = song.usdx.as_ref() {
            let voc = bundle.vocals.as_ref().unwrap_or(&bundle.audio);
            let inst = bundle.instrumental.as_ref().unwrap_or(&bundle.audio);
            return audio_paths(
                inst.to_string_lossy().into_owned(),
                Some(voc.to_string_lossy().into_owned()),
                replay,
            );
        }

        let effective_key = song.override_key.as_ref().or(song.key.as_ref());
        let tempo = normalize_tempo(song.tempo);

        if let Some(key) = effective_key {
            let variant_instrumental = cache.variant_instrumental_path(file_hash, key, tempo);
            let variant_vocals = cache.variant_vocals_path(file_hash, key, tempo);
            if is_base_original_selection(&song, key, tempo) {
                if variant_instrumental.is_file() && variant_vocals.is_file() {
                    return audio_paths(
                        variant_instrumental.to_string_lossy().into_owned(),
                        Some(variant_vocals.to_string_lossy().into_owned()),
                        replay,
                    );
                }
                let legacy_inst = cache.instrumental_path(file_hash);
                let legacy_voc = cache.vocals_path(file_hash);
                if legacy_inst.is_file() && legacy_voc.is_file() {
                    return audio_paths(
                        legacy_inst.to_string_lossy().into_owned(),
                        Some(legacy_voc.to_string_lossy().into_owned()),
                        replay,
                    );
                }
            }
            if variant_instrumental.is_file() && variant_vocals.is_file() {
                return audio_paths(
                    variant_instrumental.to_string_lossy().into_owned(),
                    Some(variant_vocals.to_string_lossy().into_owned()),
                    replay,
                );
            }
        }
    }

    let legacy_inst = cache.instrumental_path(file_hash);
    let legacy_voc = cache.vocals_path(file_hash);
    audio_paths(
        legacy_inst.to_string_lossy().into_owned(),
        Some(legacy_voc.to_string_lossy().into_owned()),
        replay,
    )
}

fn is_mp4_compatible_source(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let normalized = ext.to_ascii_lowercase();
            normalized == "mp4" || normalized == "m4v"
        })
        .unwrap_or(false)
}

fn convert_video_to_mp4(source: &Path, target: &Path, tmp: &Path) -> Result<(), NightingaleError> {
    let status = silent_command(ffmpeg_path())
        .args(["-y", "-i"])
        .arg(source)
        .args([
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-crf",
            "23",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            "-c:a",
            "aac",
            "-b:a",
            "160k",
            "-ac",
            "2",
            "-ar",
            "48000",
            "-sn",
            "-dn",
            "-v",
            "error",
        ])
        .arg(tmp)
        .status()?;

    if !status.success() {
        let _ = std::fs::remove_file(tmp);
        return Err(NightingaleError::Other(format!(
            "ffmpeg playable-video transcode failed with status {status}"
        )));
    }

    if target.exists() {
        let _ = std::fs::remove_file(target);
    }
    std::fs::rename(tmp, target)?;
    Ok(())
}

fn playable_input_path(path: &Path) -> PathBuf {
    let text = path.to_string_lossy();
    if let Some(unc) = text.strip_prefix(r"\\?\UNC\") {
        return PathBuf::from(format!(r"\\{unc}"));
    }
    path.to_path_buf()
}

fn is_network_video_path(path: &Path) -> bool {
    let text = path.to_string_lossy().to_ascii_lowercase();
    text.starts_with(r"\\?\unc\") || (text.starts_with(r"\\") && !text.starts_with(r"\\?\"))
}

fn browser_compatible_mp4(path: &Path) -> Result<bool, NightingaleError> {
    // Probe the local copy: checking codecs on a mapped drive can itself take
    // longer than a short song while FFmpeg seeks around a remote MP4.
    let output = silent_command(ffmpeg_path())
        .args(["-hide_banner", "-i"])
        .arg(path)
        .output()?;
    let streams = String::from_utf8_lossy(&output.stderr);
    let mut lines = streams.lines().filter(|line| line.contains("Stream #"));
    let video = lines.find(|line| line.contains("Video:") && !line.contains("(attached pic)"));
    let Some(video) = video else {
        return Ok(false);
    };
    let h264 = video.contains("Video: h264 ") || video.contains("Video: h264 (");
    let yuv420 = video.contains("yuv420p(") || video.contains("yuv420p,");
    let audio = streams
        .lines()
        .find(|line| line.contains("Stream #") && line.contains("Audio:"));
    let aac =
        audio.is_none_or(|line| line.contains("Audio: aac ") || line.contains("Audio: aac ("));
    Ok(h264 && yuv420 && aac)
}

fn remux_browser_mp4(source: &Path, target: &Path, tmp: &Path) -> Result<(), NightingaleError> {
    let status = silent_command(ffmpeg_path())
        .args(["-y", "-i"])
        .arg(source)
        .args([
            "-map",
            "0:v:0",
            "-map",
            "0:a:0?",
            "-c",
            "copy",
            "-movflags",
            "+faststart",
            "-sn",
            "-dn",
            "-v",
            "error",
        ])
        .arg(tmp)
        .status()?;
    if !status.success() {
        let _ = std::fs::remove_file(tmp);
        return Err(NightingaleError::Other(format!(
            "ffmpeg MV remux failed with status {status}"
        )));
    }
    std::fs::rename(tmp, target)?;
    Ok(())
}

fn prepare_network_mp4(
    source: &Path,
    target: &Path,
    tmp: &Path,
    cache_key: &str,
) -> Result<(), NightingaleError> {
    let parent = target
        .parent()
        .ok_or_else(|| NightingaleError::Other("Invalid MV cache path".into()))?;
    let local_source = parent.join(format!("{cache_key}.{}.source.mp4", std::process::id()));
    if let Err(error) = std::fs::copy(source, &local_source) {
        let _ = std::fs::remove_file(&local_source);
        return Err(error.into());
    }
    let result = (|| {
        if browser_compatible_mp4(&local_source)?
            && remux_browser_mp4(&local_source, target, tmp).is_ok()
        {
            return Ok(());
        }
        convert_video_to_mp4(&local_source, target, tmp)
    })();
    let _ = std::fs::remove_file(&local_source);
    result
}

pub fn ensure_playable_associated_mv(file_hash: &str) -> Result<Option<String>, NightingaleError> {
    let association = library_db::get_song_mv(file_hash).map_err(NightingaleError::Other)?;
    if !association.enabled {
        return Ok(None);
    }
    let Some(selected) = association.effective_path else {
        return Ok(None);
    };
    let source = PathBuf::from(selected);
    let extension = source
        .extension()
        .and_then(|ext| ext.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if !["mp4", "mkv", "avi", "webm", "mov", "m4v"].contains(&extension.as_str()) {
        return Err(NightingaleError::Other("Unsupported MV file type".into()));
    }
    let media_input = playable_input_path(&source);
    let resolved = media_input.canonicalize()?;
    if !resolved.is_file() {
        return Err(NightingaleError::Other("MV file is unavailable".into()));
    }
    let metadata = resolved.metadata()?;
    let fingerprint = format!(
        "mv-v3:{}:{}:{}:{:?}",
        file_hash,
        resolved.display(),
        metadata.len(),
        metadata.modified().ok()
    );
    let cache_key = format!("mv-{}", blake3::hash(fingerprint.as_bytes()).to_hex());
    let target = CacheDir::new().playable_video_path(&cache_key);
    if target.is_file() {
        return Ok(Some(target.to_string_lossy().into_owned()));
    }
    let temporary = target
        .parent()
        .ok_or_else(|| NightingaleError::Other("Invalid MV cache path".into()))?
        .join(format!("{cache_key}.{}.tmp.mp4", std::process::id()));

    loop {
        let mut inflight = PLAYABLE_VIDEO_INFLIGHT
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if inflight.insert(cache_key.clone()) {
            break;
        }
        drop(inflight);
        if target.is_file() {
            return Ok(Some(target.to_string_lossy().into_owned()));
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    let result = (|| {
        let parent = target
            .parent()
            .ok_or_else(|| NightingaleError::Other("Invalid MV cache path".into()))?;
        std::fs::create_dir_all(parent)?;
        if is_mp4_compatible_source(&resolved) {
            if is_network_video_path(&resolved) {
                prepare_network_mp4(&media_input, &target, &temporary, &cache_key)?;
            } else {
                std::fs::copy(&media_input, &temporary)?;
                std::fs::rename(&temporary, &target)?;
            }
        } else {
            convert_video_to_mp4(&media_input, &target, &temporary)?;
        }
        Ok::<(), NightingaleError>(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }

    PLAYABLE_VIDEO_INFLIGHT
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(&cache_key);
    result?;
    Ok(Some(target.to_string_lossy().into_owned()))
}

pub fn ensure_playable_source_video(file_hash: &str) -> Result<Option<String>, NightingaleError> {
    let Some(song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return Err(NightingaleError::Other("Song not found".into()));
    };

    if !song.is_video && song.usdx.as_ref().and_then(|b| b.video.as_ref()).is_none() {
        return Ok(None);
    }

    let cache = CacheDir::new();

    // For remote-origin songs we have to materialise the underlying media
    // file before we can decide whether it needs ffmpeg transcoding. Folder
    // file before we can decide whether it needs ffmpeg transcoding. Folder
    // sources are no-ops here (the trait just hands `song.path` back).
    let materialised = if matches!(song.origin, SongOrigin::LocalFile) {
        None
    } else {
        let source = crate::source::active_source()?
            .ok_or_else(|| NightingaleError::Other("no active library source".into()))?;
        Some(source.ensure_local_media(&song, &cache)?)
    };

    let source_path = if song.is_video {
        materialised.unwrap_or_else(|| song.path.clone())
    } else if let Some(video) = song.usdx.as_ref().and_then(|b| b.video.clone()) {
        video
    } else {
        return Ok(None);
    };

    if is_mp4_compatible_source(&source_path) {
        return Ok(Some(source_path.to_string_lossy().into_owned()));
    }

    let target = cache.playable_video_path(file_hash);
    if target.is_file() {
        return Ok(Some(target.to_string_lossy().into_owned()));
    }

    loop {
        let mut inflight = PLAYABLE_VIDEO_INFLIGHT
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        if inflight.insert(file_hash.to_string()) {
            break;
        }
        drop(inflight);

        if target.is_file() {
            return Ok(Some(target.to_string_lossy().into_owned()));
        }
        std::thread::sleep(std::time::Duration::from_millis(150));
    }

    let transcode_result = (|| {
        let Some(parent) = target.parent() else {
            return Err(NightingaleError::Other(
                "Invalid playable video path".into(),
            ));
        };
        std::fs::create_dir_all(parent)?;
        let tmp = parent.join(format!("{file_hash}.{}.tmp.mp4", std::process::id()));
        convert_video_to_mp4(&source_path, &target, &tmp)?;
        Ok::<(), NightingaleError>(())
    })();

    PLAYABLE_VIDEO_INFLIGHT
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner)
        .remove(file_hash);

    match transcode_result {
        Ok(()) => Ok(Some(target.to_string_lossy().into_owned())),
        Err(err) => Err(err),
    }
}

fn convert_ogg_to_mp3(ogg: &PathBuf, mp3: &PathBuf) -> Result<(), NightingaleError> {
    let status = silent_command(ffmpeg_path())
        .args(["-y", "-i"])
        .arg(ogg)
        .args(["-c:a", "libmp3lame", "-q:a", "2", "-v", "error"])
        .arg(mp3)
        .status()?;

    if !status.success() {
        return Err(NightingaleError::Other(format!(
            "ffmpeg exited with status {}",
            status
        )));
    }

    std::fs::remove_file(ogg).ok();
    Ok(())
}

fn run_rubberband_filter(
    input: &Path,
    output: &Path,
    pitch_ratio: f64,
    tempo_ratio: f64,
) -> Result<(), NightingaleError> {
    let filter = format!("rubberband=pitch={pitch_ratio}:tempo={tempo_ratio}");
    let status = silent_command(ffmpeg_path())
        .args(["-y", "-i"])
        .arg(input)
        .args([
            "-af",
            &filter,
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            "-v",
            "error",
        ])
        .arg(output)
        .status()?;
    if !status.success() {
        return Err(NightingaleError::Other(format!(
            "ffmpeg rubberband failed with status {status}"
        )));
    }
    Ok(())
}

fn run_rubberband_pair_parallel(
    source_inst: &Path,
    target_inst: &Path,
    source_voc: &Path,
    target_voc: &Path,
    pitch_ratio: f64,
    tempo_ratio: f64,
) -> Result<(), NightingaleError> {
    let source_inst = source_inst.to_path_buf();
    let target_inst = target_inst.to_path_buf();
    let source_voc = source_voc.to_path_buf();
    let target_voc = target_voc.to_path_buf();

    let inst_worker = std::thread::spawn(move || {
        run_rubberband_filter(&source_inst, &target_inst, pitch_ratio, tempo_ratio)
            .map_err(|e| e.to_string())
    });
    let voc_worker = std::thread::spawn(move || {
        run_rubberband_filter(&source_voc, &target_voc, pitch_ratio, tempo_ratio)
            .map_err(|e| e.to_string())
    });

    let inst_result = inst_worker
        .join()
        .map_err(|_| NightingaleError::Other("instrumental transform thread panicked".into()))?;
    let voc_result = voc_worker
        .join()
        .map_err(|_| NightingaleError::Other("vocals transform thread panicked".into()))?;

    if let Err(err) = inst_result {
        return Err(NightingaleError::Other(err));
    }
    if let Err(err) = voc_result {
        return Err(NightingaleError::Other(err));
    }
    Ok(())
}

fn resolve_original_stems(
    cache: &CacheDir,
    file_hash: &str,
    song: &Song,
) -> Result<(PathBuf, PathBuf), NightingaleError> {
    let key = song.key.as_deref().ok_or_else(|| {
        NightingaleError::Other("No original key available; re-analyze first".into())
    })?;
    let canonical_inst = cache.variant_instrumental_path(file_hash, key, 1.0);
    let canonical_voc = cache.variant_vocals_path(file_hash, key, 1.0);
    if canonical_inst.is_file() && canonical_voc.is_file() {
        return Ok((canonical_inst, canonical_voc));
    }

    let legacy_inst = cache.instrumental_path(file_hash);
    let legacy_voc = cache.vocals_path(file_hash);
    if legacy_inst.is_file() && legacy_voc.is_file() {
        return Ok((legacy_inst, legacy_voc));
    }

    let ogg_inst = cache.legacy_instrumental_path(file_hash);
    let ogg_voc = cache.legacy_vocals_path(file_hash);
    if ogg_inst.is_file() && ogg_voc.is_file() {
        return Ok((ogg_inst, ogg_voc));
    }

    Err(NightingaleError::Other(format!(
        "Original stems for key '{key}' not found. Re-analyze the song first."
    )))
}

type StemPair = (PathBuf, PathBuf);

static STEM_TRANSFORM_LOCKS: LazyLock<Mutex<HashMap<String, Arc<Mutex<()>>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn stem_transform_lock(file_hash: &str) -> Result<Arc<Mutex<()>>, NightingaleError> {
    let mut locks = STEM_TRANSFORM_LOCKS
        .lock()
        .map_err(|_| NightingaleError::Other("Audio transform lock unavailable".into()))?;
    Ok(locks
        .entry(file_hash.to_string())
        .or_insert_with(|| Arc::new(Mutex::new(())))
        .clone())
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct StemSourceStamp {
    len: u64,
    modified_seconds: u64,
    modified_nanos: u32,
}

impl StemSourceStamp {
    fn read(path: &Path) -> Result<Self, NightingaleError> {
        let metadata = std::fs::metadata(path)?;
        let modified = metadata
            .modified()?
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| NightingaleError::Other("Invalid stem modification time".into()))?;
        Ok(Self {
            len: metadata.len(),
            modified_seconds: modified.as_secs(),
            modified_nanos: modified.subsec_nanos(),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct StemVariantStamp {
    version: u8,
    file_hash: String,
    base_key: String,
    target_key: String,
    key_offset: i32,
    tempo: f64,
    instrumental: StemSourceStamp,
    vocals: StemSourceStamp,
}

fn nonempty_file(path: &Path) -> bool {
    path.metadata()
        .is_ok_and(|metadata| metadata.is_file() && metadata.len() > 0)
}

fn verified_variant(target: &StemPair, expected: &StemVariantStamp) -> bool {
    let marker = target.0.with_extension("shift-v2.json");
    let saved = std::fs::read(marker)
        .ok()
        .and_then(|bytes| serde_json::from_slice::<StemVariantStamp>(&bytes).ok());
    saved.as_ref() == Some(expected) && nonempty_file(&target.0) && nonempty_file(&target.1)
}

fn remove_generated_file(path: &Path) -> Result<(), NightingaleError> {
    match std::fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.into()),
    }
}

fn cleanup_transform_files(paths: &StemPair) {
    for path in [&paths.0, &paths.1] {
        if let Err(error) = remove_generated_file(path) {
            warn!(%error, "Could not remove a temporary audio transform");
        }
    }
}

fn ensure_verified_variant(
    original: &StemPair,
    target: &StemPair,
    stamp: &StemVariantStamp,
) -> Result<(), NightingaleError> {
    if verified_variant(target, stamp) {
        return Ok(());
    }
    if original.0 == target.0 || original.1 == target.1 {
        return Err("Refusing to overwrite original stems".into());
    }
    let marker = target.0.with_extension("shift-v2.json");
    remove_generated_file(&marker)?;
    let nonce = rand::random::<u64>();
    let temporary = (
        target.0.with_file_name(format!(
            "{}_shift_temp_{nonce}_instrumental.mp3",
            stamp.file_hash
        )),
        target
            .1
            .with_file_name(format!("{}_shift_temp_{nonce}_vocals.mp3", stamp.file_hash)),
    );
    let result = (|| {
        let ratio = 2f64.powf(f64::from(stamp.key_offset) / 12.0);
        if !ratio.is_finite() || ratio <= 0.0 {
            return Err("Invalid pitch offset".into());
        }
        run_rubberband_pair_parallel(
            &original.0,
            &temporary.0,
            &original.1,
            &temporary.1,
            ratio,
            stamp.tempo,
        )?;
        if !nonempty_file(&temporary.0) || !nonempty_file(&temporary.1) {
            return Err("Audio transform produced an empty stem".into());
        }
        remove_generated_file(&target.0)?;
        std::fs::rename(&temporary.0, &target.0)?;
        remove_generated_file(&target.1)?;
        std::fs::rename(&temporary.1, &target.1)?;
        std::fs::write(marker, serde_json::to_vec(stamp)?)?;
        Ok(())
    })();
    cleanup_transform_files(&temporary);
    result
}

fn ensure_stem_variant(
    cache: &CacheDir,
    file_hash: &str,
    song: &Song,
    key: &str,
    key_offset: i32,
    tempo: f64,
) -> Result<StemPair, NightingaleError> {
    let original = resolve_original_stems(cache, file_hash, song)?;
    let base_key = song
        .key
        .as_deref()
        .ok_or_else(|| NightingaleError::Other("No original key available".into()))?;
    if (key == base_key) != (key_offset == 0) {
        return Err("Target key and semitone offset do not match the original key".into());
    }
    if key == base_key && tempo == 1.0 {
        return Ok(original);
    }
    let mut stamp = StemVariantStamp {
        version: 2,
        file_hash: file_hash.to_string(),
        base_key: base_key.to_string(),
        target_key: key.to_string(),
        key_offset,
        tempo: 1.0,
        instrumental: StemSourceStamp::read(&original.0)?,
        vocals: StemSourceStamp::read(&original.1)?,
    };
    let canonical = (
        cache.variant_instrumental_path(file_hash, key, 1.0),
        cache.variant_vocals_path(file_hash, key, 1.0),
    );
    if key != base_key {
        ensure_verified_variant(&original, &canonical, &stamp)?;
    }
    if tempo == 1.0 {
        return Ok(canonical);
    }
    let target = (
        cache.variant_instrumental_path(file_hash, key, tempo),
        cache.variant_vocals_path(file_hash, key, tempo),
    );
    stamp.tempo = tempo;
    ensure_verified_variant(&original, &target, &stamp)?;
    Ok(target)
}

/// Key/tempo shift for LRC-provided songs played without stem separation.
/// Everything is derived from the untouched original mix (single track, no
/// guide vocals), and tempo changes scale the provided transcript timings.
fn no_stems_shift(
    cache: &CacheDir,
    file_hash: &str,
    mut song: Song,
    target_key: String,
    key_offset: i32,
    target_tempo: f64,
) -> Result<ShiftResult, NightingaleError> {
    let target_tempo = normalize_tempo(target_tempo);
    let base_key = song.key.clone().unwrap_or_else(|| target_key.clone());

    // Base selection: play the untouched original mix.
    if key_offset == 0 && target_tempo == 1.0 {
        song.override_key = None;
        song.tempo = 1.0;
        song.key_offset = 0;
        cache.delete_transcript_variants(file_hash);
        library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
        return Ok(ShiftResult {
            key: base_key,
            tempo: 1.0,
        });
    }

    let target_inst = cache.variant_instrumental_path(file_hash, &target_key, target_tempo);
    if !target_inst.is_file() {
        let source = resolve_original_media(&song, cache);
        let pitch_ratio = 2f64.powf(f64::from(key_offset) / 12.0);
        run_rubberband_filter(Path::new(&source), &target_inst, pitch_ratio, target_tempo)?;
    }

    // Tempo changes stretch the timeline, so scale the LRC timings into a
    // tempo variant that playback picks up for the shifted mix.
    if target_tempo != 1.0 {
        write_tempo_transcript(cache, file_hash, &target_key, target_tempo)?;
    }

    song.override_key = if base_key == target_key {
        None
    } else {
        Some(target_key.clone())
    };
    song.tempo = target_tempo;
    song.key_offset = key_offset;
    library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;

    Ok(ShiftResult {
        key: target_key,
        tempo: target_tempo,
    })
}

/// Write the `tempo` variant of the base transcript, with every timestamp
/// scaled to the stretched timeline.
fn write_tempo_transcript(
    cache: &CacheDir,
    file_hash: &str,
    key: &str,
    tempo: f64,
) -> Result<PathBuf, NightingaleError> {
    let base_transcript = std::fs::read_to_string(cache.transcript_path(file_hash))?;
    let mut transcript: Value = serde_json::from_str(&base_transcript)?;
    scale_transcript_timestamps(&mut transcript, 1.0 / tempo);
    transcript["tempo"] = Value::from(tempo);
    transcript["key"] = Value::from(key);
    let path = cache.variant_transcript_path(file_hash, tempo);
    std::fs::write(&path, serde_json::to_string_pretty(&transcript)?)?;
    Ok(path)
}

fn round_transcript_time(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

fn scale_time_field(node: &mut Value, field: &str, factor: f64) {
    let Some(v) = node.get(field).and_then(|v| v.as_f64()) else {
        return;
    };
    if let Some(slot) = node.get_mut(field) {
        *slot = Value::from(round_transcript_time(v * factor));
    }
}

fn scale_transcript_timestamps(transcript: &mut Value, factor: f64) {
    let Some(segments) = transcript
        .get_mut("segments")
        .and_then(|v| v.as_array_mut())
    else {
        return;
    };
    for segment in segments {
        scale_time_field(segment, "start", factor);
        scale_time_field(segment, "end", factor);
        if let Some(words) = segment.get_mut("words").and_then(|v| v.as_array_mut()) {
            for word in words {
                scale_time_field(word, "start", factor);
                scale_time_field(word, "end", factor);
            }
        }
    }
}

pub fn ensure_mp3_stems(file_hash: &str) -> Result<(), NightingaleError> {
    let transform_lock = stem_transform_lock(file_hash)?;
    let _guard = transform_lock
        .lock()
        .map_err(|_| NightingaleError::Other("Audio transform lock unavailable".into()))?;
    let cache = CacheDir::new();

    if let Some(song) = library_db::load_song_by_hash(file_hash).ok().flatten() {
        if song.usdx.is_some() {
            return Ok(());
        }
        // LRC-provided songs without separation have no stems to convert; they
        // play the original mix directly.
        if song.no_stems {
            return Ok(());
        }
        if let Some((key, tempo)) = resolve_effective_key_tempo(&song)
            && !is_base_original_selection(&song, &key, tempo)
        {
            ensure_stem_variant(&cache, file_hash, &song, &key, song.key_offset, tempo)?;
            if tempo != 1.0 {
                write_tempo_transcript(&cache, file_hash, &key, tempo)?;
            }
            return Ok(());
        }
    }

    let mp3_inst = cache.instrumental_path(file_hash);
    let mp3_voc = cache.vocals_path(file_hash);

    if mp3_inst.is_file() && mp3_voc.is_file() {
        return Ok(());
    }

    if cache.has_variant_stems(file_hash) {
        return Ok(());
    }

    let ogg_inst = cache.legacy_instrumental_path(file_hash);
    let ogg_voc = cache.legacy_vocals_path(file_hash);

    if !ogg_inst.is_file() || !ogg_voc.is_file() {
        return Err("No stems found (neither mp3 nor ogg)".into());
    }

    info!("Converting legacy OGG stems to MP3 for {file_hash}");
    let ogg_inst_thread = ogg_inst.clone();
    let mp3_inst_thread = mp3_inst.clone();
    let inst_worker = std::thread::spawn(move || {
        convert_ogg_to_mp3(&ogg_inst_thread, &mp3_inst_thread).map_err(|e| e.to_string())
    });
    let ogg_voc_thread = ogg_voc.clone();
    let mp3_voc_thread = mp3_voc.clone();
    let voc_worker = std::thread::spawn(move || {
        convert_ogg_to_mp3(&ogg_voc_thread, &mp3_voc_thread).map_err(|e| e.to_string())
    });

    let inst_result = inst_worker
        .join()
        .map_err(|_| NightingaleError::Other("instrumental conversion thread panicked".into()))?;
    let voc_result = voc_worker
        .join()
        .map_err(|_| NightingaleError::Other("vocals conversion thread panicked".into()))?;
    if let Err(err) = inst_result {
        return Err(err.into());
    }
    if let Err(err) = voc_result {
        return Err(err.into());
    }

    Ok(())
}

pub fn shift_key(
    file_hash: &str,
    key: &str,
    pitch_ratio: f64,
    key_offset: i32,
) -> Result<ShiftResult, NightingaleError> {
    let transform_lock = stem_transform_lock(file_hash)?;
    let _guard = transform_lock
        .lock()
        .map_err(|_| NightingaleError::Other("Audio transform lock unavailable".into()))?;
    let Some(mut song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return Err("Song not found".into());
    };
    if song.usdx.is_some() {
        return Err("Key shift is not supported for USDX songs".into());
    }
    let cache = CacheDir::new();
    let target_key = key.trim().to_string();
    if target_key.is_empty() {
        return Err("target key cannot be empty".into());
    }
    let target_tempo = normalize_tempo(song.tempo);
    if song.no_stems {
        return no_stems_shift(
            &cache,
            file_hash,
            song,
            target_key,
            key_offset,
            target_tempo,
        );
    }
    let absolute_ratio = 2f64.powf(f64::from(key_offset) / 12.0);
    if !pitch_ratio.is_finite()
        || !absolute_ratio.is_finite()
        || (pitch_ratio - absolute_ratio).abs() > 1e-8
        || absolute_ratio <= 0.0
    {
        return Err("Pitch ratio must match the semitone offset from the original key".into());
    }
    ensure_stem_variant(
        &cache,
        file_hash,
        &song,
        &target_key,
        key_offset,
        target_tempo,
    )?;
    if target_tempo != 1.0 {
        write_tempo_transcript(&cache, file_hash, &target_key, target_tempo)?;
    }
    song.override_key = if song.key.as_deref() == Some(target_key.as_str()) {
        None
    } else {
        Some(target_key.clone())
    };
    song.tempo = target_tempo;
    song.key_offset = key_offset;
    library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
    Ok(ShiftResult {
        key: target_key,
        tempo: target_tempo,
    })
}

pub fn shift_tempo(file_hash: &str, tempo: f64) -> Result<ShiftResult, NightingaleError> {
    let transform_lock = stem_transform_lock(file_hash)?;
    let _guard = transform_lock
        .lock()
        .map_err(|_| NightingaleError::Other("Audio transform lock unavailable".into()))?;
    let Some(mut song) = library_db::load_song_by_hash(file_hash).ok().flatten() else {
        return Err("Song not found".into());
    };
    if song.usdx.is_some() {
        return Err("Tempo shift is not supported for USDX songs".into());
    }
    let cache = CacheDir::new();
    let key = song
        .override_key
        .clone()
        .or(song.key.clone())
        .ok_or_else(|| {
            NightingaleError::Other("Key detection still in progress; try again shortly".into())
        })?;
    let target_tempo = normalize_tempo(tempo);
    if song.no_stems {
        let key_offset = song.key_offset;
        return no_stems_shift(&cache, file_hash, song, key, key_offset, target_tempo);
    }
    ensure_stem_variant(
        &cache,
        file_hash,
        &song,
        &key,
        song.key_offset,
        target_tempo,
    )?;
    if target_tempo != 1.0 {
        write_tempo_transcript(&cache, file_hash, &key, target_tempo)?;
    }
    song.tempo = target_tempo;
    if song.key.as_deref() == Some(key.as_str()) {
        song.override_key = None;
    }
    library_db::update_song_fields(file_hash, &song).map_err(|e| e.to_string())?;
    Ok(ShiftResult {
        key,
        tempo: target_tempo,
    })
}

pub fn shift_key_done_payload(
    file_hash: String,
    key: String,
    pitch_ratio: f64,
    key_offset: i32,
) -> ShiftDone {
    match shift_key(&file_hash, &key, pitch_ratio, key_offset) {
        Ok(done) => ShiftDone {
            file_hash,
            key: Some(done.key),
            tempo: Some(done.tempo),
            error: None,
        },
        Err(err) => ShiftDone {
            file_hash,
            key: Some(key),
            tempo: None,
            error: Some(err.to_string()),
        },
    }
}

pub fn shift_tempo_done_payload(file_hash: String, tempo: f64) -> ShiftDone {
    match shift_tempo(&file_hash, tempo) {
        Ok(done) => ShiftDone {
            file_hash,
            key: Some(done.key),
            tempo: Some(done.tempo),
            error: None,
        },
        Err(err) => ShiftDone {
            file_hash,
            key: None,
            tempo: Some(tempo),
            error: Some(err.to_string()),
        },
    }
}

pub fn ensure_mp3_stems_ready_payload(file_hash: String) -> StemsReady {
    let result = ensure_mp3_stems(&file_hash);
    StemsReady {
        file_hash,
        error: result.err().map(|e| e.to_string()),
    }
}

const PIXABAY_PER_PAGE: u32 = 200;
const MAX_CACHED_VIDEOS: usize = 6;
static PLAYABLE_VIDEO_INFLIGHT: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

struct FlavorConfig {
    keywords: &'static [&'static str],
    category: &'static str,
}

fn flavor_config(flavor: &str) -> FlavorConfig {
    match flavor {
        "underwater" => FlavorConfig {
            keywords: &[
                "underwater coral reef",
                "deep sea fish",
                "ocean jellyfish",
                "tropical fish underwater",
                "sea turtle underwater",
            ],
            category: "animals",
        },
        "space" => FlavorConfig {
            keywords: &[
                "galaxy stars universe",
                "nebula deep space",
                "aurora borealis sky",
                "earth orbit space",
                "milky way night sky",
            ],
            category: "science",
        },
        "city" => FlavorConfig {
            keywords: &[
                "city skyline night",
                "city traffic timelapse",
                "neon lights city",
                "urban aerial night",
                "highway traffic night",
            ],
            category: "buildings",
        },
        "countryside" => FlavorConfig {
            keywords: &[
                "countryside meadow aerial",
                "farm fields drone",
                "rolling hills green",
                "village landscape scenic",
                "pastoral landscape sunset",
            ],
            category: "places",
        },
        _ => FlavorConfig {
            keywords: &[
                "nature landscape aerial",
                "forest trees cinematic",
                "mountain scenery drone",
                "sunset clouds timelapse",
                "waterfall tropical scenic",
            ],
            category: "nature",
        },
    }
}

fn urlencode_query(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b' ' => "+".to_string(),
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

fn flavor_cache_dir(flavor: &str) -> PathBuf {
    let dir = videos_dir().join(flavor);
    std::fs::create_dir_all(&dir).ok();
    dir
}

fn cached_video_paths(flavor: &str) -> Vec<PathBuf> {
    let dir = flavor_cache_dir(flavor);
    let mut files: Vec<PathBuf> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.extension().is_some_and(|ext| ext == "mp4"))
        .collect();
    files.sort();
    files
}

struct PendingDownload {
    url: String,
    dest: PathBuf,
}

fn fetch_video_listing(flavor: &str) -> Result<Vec<PendingDownload>, String> {
    let api_key = option_env!("PIXABAY_API_KEY")
        .map(|s| s.to_string())
        .or_else(|| std::env::var("PIXABAY_API_KEY").ok())
        .unwrap_or_default();

    if api_key.is_empty() {
        return Err("PIXABAY_API_KEY not set".into());
    }

    let config = flavor_config(flavor);
    let mut rng = rand::rng();
    let dir = flavor_cache_dir(flavor);

    let keyword = config
        .keywords
        .choose(&mut rng)
        .unwrap_or(&config.keywords[0]);
    let order = if rand::random::<bool>() {
        "popular"
    } else {
        "latest"
    };

    let url = format!(
        "https://pixabay.com/api/videos/?key={}&q={}&video_type=film&category={}&per_page={}&safesearch=true&order={}",
        api_key,
        urlencode_query(keyword),
        config.category,
        PIXABAY_PER_PAGE,
        order,
    );

    let body: Value = ureq::get(&url)
        .call()
        .map_err(|e| e.to_string())?
        .body_mut()
        .read_json()
        .map_err(|e| e.to_string())?;

    let hits = body["hits"]
        .as_array()
        .ok_or("No hits in Pixabay response")?;

    let mut results: Vec<PendingDownload> = hits
        .iter()
        .filter_map(|hit| {
            let video_id = hit["id"].as_u64().unwrap_or(0);
            let video_url = hit["videos"]["large"]["url"]
                .as_str()
                .or_else(|| hit["videos"]["medium"]["url"].as_str())?;
            Some(PendingDownload {
                url: video_url.to_string(),
                dest: dir.join(format!("{video_id}.mp4")),
            })
        })
        .collect();

    results.shuffle(&mut rng);
    Ok(results)
}

fn download_file(url: &str, dest: &PathBuf) -> Result<(), String> {
    let resp = ureq::get(url).call().map_err(|e| e.to_string())?;
    let mut reader = resp.into_body().into_reader();
    let mut file = std::fs::File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut reader, &mut file).map_err(|e| e.to_string())?;
    Ok(())
}

fn oldest_cached_video(cached: &[PathBuf], exclude: Option<&PathBuf>) -> Option<PathBuf> {
    cached
        .iter()
        .filter(|path| exclude.is_none_or(|skip| *path != skip))
        .min_by(|a, b| {
            let a_time = a
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            let b_time = b
                .metadata()
                .and_then(|m| m.modified())
                .ok()
                .and_then(|t| t.duration_since(std::time::SystemTime::UNIX_EPOCH).ok())
                .map(|d| d.as_millis())
                .unwrap_or(0);
            a_time.cmp(&b_time).then_with(|| a.cmp(b))
        })
        .cloned()
}

pub fn get_cached_pixabay_videos(flavor: &str) -> Vec<String> {
    let mut cached = cached_video_paths(flavor);
    let mut rng = rand::rng();
    cached.shuffle(&mut rng);
    cached
        .into_iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

pub fn download_pixabay_videos(
    flavor: &str,
    on_downloaded: impl Fn(String, Option<String>) + Send + 'static,
) {
    let listing = match fetch_video_listing(flavor) {
        Ok(l) => l,
        Err(_) => return,
    };

    let mut cached = cached_video_paths(flavor);

    while cached.len() > MAX_CACHED_VIDEOS {
        let Some(evicted) = oldest_cached_video(&cached, None) else {
            break;
        };
        std::fs::remove_file(&evicted).ok();
        cached.retain(|path| path != &evicted);
    }

    for dl in listing.iter().filter(|p| !p.dest.exists()) {
        if cached.len() >= MAX_CACHED_VIDEOS {
            break;
        }
        if download_file(&dl.url, &dl.dest).is_ok() {
            cached.push(dl.dest.clone());
            on_downloaded(dl.dest.to_string_lossy().into_owned(), None);
        }
    }

    if cached.len() < MAX_CACHED_VIDEOS {
        return;
    }

    let Some(next) = listing.iter().find(|p| !p.dest.exists()) else {
        return;
    };

    if download_file(&next.url, &next.dest).is_ok() {
        cached.push(next.dest.clone());
        let new_path = next.dest.to_string_lossy().into_owned();
        if let Some(evicted) = oldest_cached_video(&cached, Some(&next.dest)) {
            let evicted_path = evicted.to_string_lossy().into_owned();
            std::fs::remove_file(&evicted).ok();
            on_downloaded(new_path, Some(evicted_path));
            return;
        }
        on_downloaded(new_path, None);
    }
}

pub fn prefetch_one_per_flavor(mut on_progress: impl FnMut(&str) + Send) {
    let flavors = ["nature", "underwater", "space", "city", "countryside"];
    for flavor in flavors {
        let existing = cached_video_paths(flavor);
        if !existing.is_empty() {
            on_progress(&format!("{flavor}: already cached"));
            continue;
        }

        on_progress(&format!("{flavor}: fetching listing..."));
        let listing = match fetch_video_listing(flavor) {
            Ok(l) => l,
            Err(e) => {
                on_progress(&format!("{flavor}: listing failed ({e})"));
                continue;
            }
        };
        let first = listing.into_iter().find(|p| !p.dest.exists());
        let Some(dl) = first else {
            on_progress(&format!("{flavor}: no videos available"));
            continue;
        };

        on_progress(&format!("{flavor}: downloading..."));
        match download_file(&dl.url, &dl.dest) {
            Ok(_) => {
                on_progress(&format!("{flavor}: ready"));
                info!("Prefetch: saved {} for {flavor}", dl.dest.display());
            }
            Err(e) => {
                on_progress(&format!("{flavor}: download failed"));
                warn!("Prefetch: failed for {flavor}: {e}");
            }
        }
    }
}
