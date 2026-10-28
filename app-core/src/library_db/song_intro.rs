use diesel::prelude::*;
use serde::Serialize;
use ts_rs::TS;

use super::connection::with_conn;
use super::schema::song_intro_overrides as overrides;
use crate::{AppConfig, Song, SongOrigin, cache::normalize_tempo, playlist_auto_analysis};

#[derive(Debug, Serialize, TS)]
#[ts(export)]
pub struct SongIntroStart {
    pub start_sec: Option<f64>,
    pub duration_sec: f64,
    pub tempo: f64,
}

fn identity(file_hash: &str) -> Result<(Song, String, String), String> {
    let song = super::load_song_by_hash(file_hash)
        .map_err(|error| error.to_string())?
        .ok_or_else(|| "Song not found".to_string())?;
    let source = playlist_auto_analysis::source_key(&AppConfig::load())?
        .ok_or_else(|| "No library source is selected".to_string())?;
    // Remote item identity survives materialization replacing its placeholder hash.
    let key = match &song.origin {
        SongOrigin::LocalFile => format!("local:{}", song.file_hash),
        SongOrigin::Jellyfin { item_id, .. } => format!("jellyfin:{item_id}"),
        SongOrigin::Navidrome { item_id, .. } => format!("navidrome:{item_id}"),
        SongOrigin::Plex { item_id, .. } => format!("plex:{item_id}"),
    };
    Ok((song, source, key))
}

fn response(song: &Song, start_sec: Option<f64>) -> SongIntroStart {
    SongIntroStart {
        start_sec,
        duration_sec: song.duration_secs,
        tempo: normalize_tempo(song.tempo),
    }
}

pub fn get_song_intro_start(file_hash: &str) -> Result<SongIntroStart, String> {
    let (song, source, key) = identity(file_hash)?;
    let start = with_conn(|conn| {
        Ok(overrides::table
            .find((&source, &key))
            .select(overrides::start_sec)
            .first::<f64>(conn)
            .optional()?)
    })
    .map_err(|error| error.to_string())?;
    Ok(response(&song, start))
}

pub fn set_song_intro_start(
    file_hash: &str,
    start_sec: Option<f64>,
) -> Result<SongIntroStart, String> {
    let (song, source, key) = identity(file_hash)?;
    if let Some(start) = start_sec
        && (!start.is_finite()
            || start < 0.0
            || !song.duration_secs.is_finite()
            || song.duration_secs <= 0.0
            || start >= song.duration_secs)
    {
        return Err("Singing start must be nonnegative and before the original song ends".into());
    }
    with_conn(|conn| {
        if let Some(start) = start_sec {
            diesel::replace_into(overrides::table)
                .values((
                    overrides::source_key.eq(&source),
                    overrides::song_key.eq(&key),
                    overrides::start_sec.eq(start),
                ))
                .execute(conn)?;
        } else {
            diesel::delete(overrides::table.find((&source, &key))).execute(conn)?;
        }
        Ok(())
    })
    .map_err(|error| error.to_string())?;
    Ok(response(&song, start_sec))
}
