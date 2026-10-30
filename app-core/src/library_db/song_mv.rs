use std::path::{Path, PathBuf};

use diesel::prelude::*;
use serde::Serialize;
use walkdir::WalkDir;

use super::connection::with_conn;
use super::schema::song_mv_associations as associations;
use crate::{AppConfig, Song, SongOrigin, playlist_auto_analysis};

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mkv", "avi", "webm", "mov", "m4v"];

#[derive(Debug, Serialize)]
pub struct SongMv {
    pub manual_path: Option<String>,
    pub automatic_path: Option<String>,
    pub effective_path: Option<String>,
    pub enabled: bool,
    pub offset_ms: i64,
}

fn identity(file_hash: &str) -> Result<(Song, String, String), String> {
    let song = super::load_song_by_hash(file_hash)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Song not found".to_string())?;
    let source = playlist_auto_analysis::source_key(&AppConfig::load())?
        .ok_or_else(|| "No library source is selected".to_string())?;
    let key = match &song.origin {
        SongOrigin::LocalFile => format!("local:{}", song.file_hash),
        SongOrigin::Jellyfin { item_id, .. } => format!("jellyfin:{item_id}"),
        SongOrigin::Navidrome { item_id, .. } => format!("navidrome:{item_id}"),
        SongOrigin::Plex { item_id, .. } => format!("plex:{item_id}"),
    };
    Ok((song, source, key))
}

fn supported_video(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            VIDEO_EXTENSIONS.contains(&extension.to_ascii_lowercase().as_str())
        })
}

fn selected_video_path(path: &str) -> Result<String, String> {
    let input = Path::new(path);
    if !input.is_absolute() {
        return Err("MV path must be absolute".into());
    }
    if !supported_video(input) {
        return Err("Choose an MP4, MKV, AVI, WebM, MOV, or M4V file".into());
    }
    let canonical = input
        .canonicalize()
        .map_err(|error| format!("MV file is unavailable: {error}"))?;
    if !canonical.is_file() {
        return Err("MV path must name a video file".into());
    }
    // Keep the path the user selected (for example K:\\MV\\song.mp4) visible
    // in the editor. Canonicalisation above only validates that it exists.
    Ok(input.to_string_lossy().into_owned())
}

fn matching_video(directory: &Path, title: &str, artist: &str) -> Result<Option<String>, String> {
    let root = directory
        .canonicalize()
        .map_err(|error| format!("MV directory is unavailable: {error}"))?;
    if !root.is_dir() {
        return Err("MV directory is not a folder".into());
    }
    let title_and_artist = (!artist.is_empty() && !artist.starts_with("Unknown "))
        .then(|| format!("{title} - {artist}"));
    let mut candidates: Vec<(u8, PathBuf)> = Vec::new();
    let mut scan_error = None;
    // Walk the original path, not its canonical UNC form: mapped drives can
    // expose a valid directory through K: while the extended UNC form cannot
    // be traversed by every Windows network provider.
    for entry in WalkDir::new(directory).follow_links(false) {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                scan_error.get_or_insert_with(|| format!("Could not scan MV directory: {error}"));
                continue;
            }
        };
        if !entry.file_type().is_file() || !supported_video(entry.path()) {
            continue;
        }
        let stem = entry.path().file_stem().and_then(|name| name.to_str());
        let priority = if stem == Some(title) {
            Some(0)
        } else if stem == title_and_artist.as_deref() {
            Some(1)
        } else {
            None
        };
        let Some(priority) = priority else { continue };
        match entry.path().canonicalize() {
            Ok(path) if path.starts_with(&root) => {
                candidates.push((priority, entry.into_path()));
            }
            Ok(_) => {
                scan_error.get_or_insert_with(|| "MV file escapes the selected folder".into());
            }
            Err(error) => {
                scan_error.get_or_insert_with(|| format!("Matched MV is unavailable: {error}"));
            }
        }
    }
    candidates.sort();
    if let Some((_, path)) = candidates.into_iter().next() {
        return Ok(Some(path.to_string_lossy().into_owned()));
    }
    if let Some(error) = scan_error {
        return Err(error);
    }
    Ok(None)
}

fn song_mv(source: &str, key: &str) -> Result<SongMv, String> {
    let row = with_conn(|conn| {
        Ok(associations::table
            .find((source, key))
            .select((
                associations::manual_path,
                associations::automatic_path,
                associations::enabled,
                associations::offset_ms,
            ))
            .first::<(Option<String>, Option<String>, bool, i64)>(conn)
            .optional()?)
    })
    .map_err(|error| error.to_string())?;
    let (manual_path, automatic_path, enabled, offset_ms) = row.unwrap_or((None, None, true, 0));
    let effective_path = manual_path.clone().or_else(|| automatic_path.clone());
    Ok(SongMv {
        manual_path,
        automatic_path,
        effective_path,
        enabled,
        offset_ms,
    })
}

pub fn get_song_mv(file_hash: &str) -> Result<SongMv, String> {
    let (_, source, key) = identity(file_hash)?;
    song_mv(&source, &key)
}

pub fn set_song_mv(file_hash: &str, path: Option<&str>) -> Result<SongMv, String> {
    let (_, source, key) = identity(file_hash)?;
    let selected = path.map(selected_video_path).transpose()?;
    with_conn(|conn| {
        diesel::insert_into(associations::table)
            .values((
                associations::source_key.eq(&source),
                associations::song_key.eq(&key),
                associations::manual_path.eq(&selected),
            ))
            .on_conflict((associations::source_key, associations::song_key))
            .do_update()
            .set(associations::manual_path.eq(&selected))
            .execute(conn)?;
        Ok(())
    })
    .map_err(|error| error.to_string())?;
    song_mv(&source, &key)
}

pub fn set_song_mv_enabled(file_hash: &str, enabled: bool) -> Result<SongMv, String> {
    let (_, source, key) = identity(file_hash)?;
    with_conn(|conn| {
        diesel::insert_into(associations::table)
            .values((
                associations::source_key.eq(&source),
                associations::song_key.eq(&key),
                associations::enabled.eq(enabled),
            ))
            .on_conflict((associations::source_key, associations::song_key))
            .do_update()
            .set(associations::enabled.eq(enabled))
            .execute(conn)?;
        Ok(())
    })
    .map_err(|error| error.to_string())?;
    song_mv(&source, &key)
}

pub fn set_song_mv_offset(file_hash: &str, offset_ms: i64) -> Result<SongMv, String> {
    if !(-1_001_000..=1_001_000).contains(&offset_ms) {
        return Err("MV offset must be between -1001 and +1001 seconds".into());
    }
    let (_, source, key) = identity(file_hash)?;
    with_conn(|conn| {
        diesel::insert_into(associations::table)
            .values((
                associations::source_key.eq(&source),
                associations::song_key.eq(&key),
                associations::offset_ms.eq(offset_ms),
            ))
            .on_conflict((associations::source_key, associations::song_key))
            .do_update()
            .set(associations::offset_ms.eq(offset_ms))
            .execute(conn)?;
        Ok(())
    })
    .map_err(|error| error.to_string())?;
    song_mv(&source, &key)
}

pub(crate) fn refresh_automatic_mv(file_hash: &str) -> Result<SongMv, String> {
    let (song, source, key) = identity(file_hash)?;
    let config = AppConfig::load();
    let found = config
        .mv_directory
        .as_ref()
        .map(|directory| matching_video(Path::new(directory), &song.title, &song.artist))
        .transpose()?
        .flatten();
    with_conn(|conn| {
        diesel::insert_into(associations::table)
            .values((
                associations::source_key.eq(&source),
                associations::song_key.eq(&key),
                associations::automatic_path.eq(&found),
            ))
            .on_conflict((associations::source_key, associations::song_key))
            .do_update()
            .set(associations::automatic_path.eq(&found))
            .execute(conn)?;
        Ok(())
    })
    .map_err(|error| error.to_string())?;
    song_mv(&source, &key)
}
