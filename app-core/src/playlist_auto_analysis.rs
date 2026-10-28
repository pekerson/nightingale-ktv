use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, Ordering};

use serde::Serialize;

use crate::{AppConfig, LibrarySource, analyzer, library_db};

static SCANNING: AtomicBool = AtomicBool::new(false);
static RESCAN_REQUESTED: AtomicBool = AtomicBool::new(false);
static POLLER_STARTED: AtomicBool = AtomicBool::new(false);

pub(crate) fn begin_scan() -> bool {
    if SCANNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        RESCAN_REQUESTED.store(true, Ordering::SeqCst);
        return false;
    }
    true
}

pub(crate) fn finish_scan() {
    SCANNING.store(false, Ordering::SeqCst);
    if RESCAN_REQUESTED.swap(false, Ordering::SeqCst) {
        crate::start_scan();
    }
}

pub fn automatic_analysis_sync_pending() -> bool {
    SCANNING.load(Ordering::SeqCst)
}

pub(crate) fn start_automatic_sync() {
    if POLLER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    std::thread::spawn(|| {
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let config = AppConfig::load();
            if let Ok(state) = playlist_auto_analysis_state(&config)
                && (state.global_enabled || state.overrides.values().any(|enabled| *enabled))
                && !SCANNING.load(Ordering::SeqCst)
            {
                crate::start_scan();
            }
        }
    });
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaylistAutoAnalysisState {
    pub source_key: Option<String>,
    pub global_enabled: bool,
    pub overrides: HashMap<String, bool>,
}

pub(crate) fn source_key(config: &AppConfig) -> Result<Option<String>, String> {
    let Some(source) = &config.library_source else {
        return Ok(None);
    };
    let identity = match source {
        LibrarySource::Folder { path } => {
            vec!["folder".into(), path.to_string_lossy().replace('\\', "/")]
        }
        LibrarySource::Navidrome {
            base_url, username, ..
        } => vec![
            "navidrome".into(),
            normalized_url(base_url)?,
            username.clone(),
        ],
        LibrarySource::Jellyfin {
            base_url, user_id, ..
        } => vec![
            "jellyfin".into(),
            normalized_url(base_url)?,
            user_id.clone(),
        ],
        LibrarySource::Plex {
            base_url,
            machine_id,
            username,
            ..
        } => vec![
            "plex".into(),
            normalized_url(base_url)?,
            machine_id.clone(),
            username.clone(),
        ],
    };
    let bytes = serde_json::to_vec(&identity).map_err(|e| e.to_string())?;
    Ok(Some(blake3::hash(&bytes).to_hex().to_string()))
}

pub(crate) fn snapshot_key(config: &AppConfig) -> Result<Option<String>, String> {
    let Some(key) = source_key(config)? else {
        return Ok(None);
    };
    let mut libraries = match &config.library_source {
        Some(LibrarySource::Jellyfin { library_ids, .. }) => library_ids.clone(),
        Some(LibrarySource::Plex { section_ids, .. }) => section_ids.clone(),
        _ => Vec::new(),
    };
    libraries.sort();
    Ok(Some(format!(
        "{key}/{}",
        serde_json::to_string(&libraries).map_err(|e| e.to_string())?
    )))
}

fn normalized_url(value: &str) -> Result<String, String> {
    let mut url = url::Url::parse(value).map_err(|e| e.to_string())?;
    let _ = url.set_username("");
    let _ = url.set_password(None);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.as_str().trim_end_matches('/').to_owned())
}

pub fn playlist_auto_analysis_state(
    config: &AppConfig,
) -> Result<PlaylistAutoAnalysisState, String> {
    let source_key = source_key(config)?;
    let prefix = source_key.as_ref().map(|key| format!("{key}/"));
    let overrides = config
        .playlist_auto_analyze
        .iter()
        .flat_map(|map| map.iter())
        .filter_map(|(key, enabled)| {
            key.strip_prefix(prefix.as_deref()?)
                .map(|id| (id.to_owned(), *enabled))
        })
        .collect();
    Ok(PlaylistAutoAnalysisState {
        source_key,
        global_enabled: config.auto_analyze(),
        overrides,
    })
}

pub fn set_playlist_auto_analysis(
    config: &mut AppConfig,
    expected_source_key: &str,
    playlist_id: &str,
    enabled: Option<bool>,
) -> Result<(), String> {
    if source_key(config)?.as_deref() != Some(expected_source_key) {
        return Err("Library source changed; reload the playlist settings".into());
    }
    if !library_db::playlist_exists(playlist_id).map_err(|e| e.to_string())? {
        return Err("Playlist no longer exists; refresh the library".into());
    }
    let key = format!("{expected_source_key}/{playlist_id}");
    let overrides = config
        .playlist_auto_analyze
        .get_or_insert_with(HashMap::new);
    if let Some(enabled) = enabled {
        overrides.insert(key, enabled);
    } else {
        overrides.remove(&key);
    }
    Ok(())
}

pub fn enqueue_automatic_analysis() -> Result<usize, String> {
    enqueue_for_policy(&AppConfig::load(), None)
}

pub fn enqueue_automatic_analysis_for_playlist(
    expected_source_key: &str,
    playlist_id: &str,
) -> Result<usize, String> {
    let config = AppConfig::load();
    if source_key(&config)?.as_deref() != Some(expected_source_key) {
        return Err("Library source changed; automatic analysis was not queued".into());
    }
    enqueue_for_policy(&config, Some(playlist_id))
}

fn enqueue_for_policy(config: &AppConfig, target_playlist: Option<&str>) -> Result<usize, String> {
    let state = playlist_auto_analysis_state(config)?;
    if !state.global_enabled && !state.overrides.values().any(|enabled| *enabled) {
        return Ok(0);
    }
    let Some(key) = snapshot_key(config)? else {
        return Ok(0);
    };
    let snapshot = library_db::load_automatic_analysis_snapshot(&key).map_err(|e| e.to_string())?;
    let needs_sync = snapshot.is_none();
    let snapshot = match snapshot {
        None if target_playlist.is_some() => {
            Some(library_db::load_known_playlist_songs().map_err(|e| e.to_string())?)
        }
        snapshot => snapshot,
    };
    let Some(snapshot) = snapshot else {
        if !SCANNING.load(Ordering::SeqCst) {
            crate::start_scan();
        }
        return Ok(0);
    };
    let mut blocked = HashSet::new();
    let mut enabled = HashSet::new();
    let mut target = HashSet::new();
    for (hash, playlist) in snapshot.memberships {
        if target_playlist == Some(playlist.as_str()) {
            target.insert(hash.clone());
        }
        match state.overrides.get(&playlist) {
            Some(false) => {
                blocked.insert(hash);
            }
            Some(true) => {
                enabled.insert(hash);
            }
            None => {}
        }
    }
    let mut hashes = snapshot.hashes;
    hashes.retain(|hash| {
        !blocked.contains(hash)
            && (state.global_enabled || enabled.contains(hash))
            && (target_playlist.is_none() || target.contains(hash))
    });
    let queued = if target_playlist.is_some() {
        analyzer::enqueue_automatic_retry_hashes(hashes)
    } else {
        analyzer::enqueue_automatic_hashes(hashes)
    };
    if needs_sync && !SCANNING.load(Ordering::SeqCst) {
        crate::start_scan();
    }
    Ok(queued)
}
