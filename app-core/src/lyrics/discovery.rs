use std::path::{Path, PathBuf};

use lofty::{
    file::TaggedFileExt,
    id3::v2::{Frame, Id3v2Tag, SyncTextContentType, SynchronizedTextFrame, TimestampFormat},
    tag::{ItemKey, TagType},
};
use tracing::info;

use super::{
    LyricsFile, build_lrc_transcript, load_sidecar_lrc, normalize_newlines, write_transcript_json,
};
use crate::{cache::CacheDir, lrc, song::Song, source::active_source};

pub(crate) enum PreparedLyrics {
    Missing,
    Text(PathBuf),
    Timed,
}

fn valid_text(text: &str) -> bool {
    text.len() <= 1024 * 1024 && text.chars().any(char::is_alphanumeric)
}

fn store_candidate(
    song: &Song,
    cache: &CacheDir,
    text: &str,
    origin: &str,
) -> Result<Option<PreparedLyrics>, String> {
    let text = normalize_newlines(text).replace('\0', "");
    if !valid_text(&text) {
        return Ok(None);
    }
    let parsed = match lrc::parse_lrc(&text) {
        Ok(parsed) => Some(parsed),
        Err(error) if lrc::has_timestamp_tags(&text) => return Err(error),
        Err(_) => None,
    };
    if let Some(parsed) = parsed {
        if !parsed
            .segments
            .iter()
            .any(|segment| valid_text(&segment.text))
        {
            return Ok(None);
        }
        if parsed.segments.iter().any(|segment| {
            !segment.start.is_finite()
                || !segment.end.is_finite()
                || segment.start < 0.0
                || segment.end < segment.start
        }) {
            return Ok(None);
        }
        let mut transcript =
            build_lrc_transcript(&parsed, song.language.as_deref(), None, 1.0, false);
        transcript["lyrics_origin"] = origin.into();
        write_transcript_json(cache, &song.file_hash, &transcript).map_err(|e| e.to_string())?;
        info!("[lyrics] Using timed lyrics from {origin}");
        return Ok(Some(PreparedLyrics::Timed));
    }
    let lines: Vec<&str> = text
        .lines()
        .map(str::trim)
        .filter(|line| valid_text(line) && !(line.starts_with('[') && line.contains(']')))
        .collect();
    if lines.is_empty() {
        return Ok(None);
    }
    let path = cache.lyrics_path(&song.file_hash);
    let json = serde_json::json!({"lines": lines, "lyrics_origin": origin});
    std::fs::write(
        &path,
        serde_json::to_vec_pretty(&json).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())?;
    info!("[lyrics] Aligning existing text from {origin}");
    Ok(Some(PreparedLyrics::Text(path)))
}

pub(crate) fn prepare_analysis_lyrics(
    song: &Song,
    path: &Path,
    cache: &CacheDir,
) -> Result<PreparedLyrics, String> {
    let transcript_path = cache.transcript_path(&song.file_hash);
    if transcript_path.is_file() {
        let bytes = std::fs::read(&transcript_path).map_err(|e| e.to_string())?;
        let transcript: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
        if transcript["segments"].as_array().is_some_and(|segments| {
            segments
                .iter()
                .any(|segment| segment["text"].as_str().is_some_and(valid_text))
        }) {
            return Ok(PreparedLyrics::Timed);
        }
        return Err(
            "Saved transcript has no valid lyrics; edit or explicitly re-transcribe it".into(),
        );
    }
    let lyrics_path = cache.lyrics_path(&song.file_hash);
    if lyrics_path.is_file() {
        let bytes = std::fs::read(&lyrics_path).map_err(|e| e.to_string())?;
        let lyrics: LyricsFile =
            serde_json::from_slice(&bytes).map_err(|e| format!("Saved lyrics are invalid: {e}"))?;
        if lyrics.lines.iter().any(|line| valid_text(line)) {
            return Ok(PreparedLyrics::Text(lyrics_path));
        }
        return Err("Saved lyrics are empty; edit or remove them before analysis".into());
    }
    if let Ok(tagged) = lofty::read_from_path(path) {
        for tag in tagged.tags() {
            if tag.tag_type() == TagType::Id3v2 {
                let id3 = Id3v2Tag::from(tag.clone());
                for frame in &id3 {
                    if frame.id_str() != "SYLT" {
                        continue;
                    }
                    let Frame::Binary(binary) = frame else {
                        continue;
                    };
                    let Ok(synced) = SynchronizedTextFrame::parse(&binary.data, binary.flags())
                    else {
                        continue;
                    };
                    if synced.content_type != SyncTextContentType::Lyrics {
                        continue;
                    }
                    let text = synced
                        .content
                        .iter()
                        .map(|(timestamp, text)| {
                            if synced.timestamp_format == TimestampFormat::MS {
                                let seconds = f64::from(*timestamp) / 1000.0;
                                format!(
                                    "[{:02}:{:06.3}]{}",
                                    (seconds / 60.0).floor() as u64,
                                    seconds % 60.0,
                                    text.replace(['\r', '\n'], " ")
                                )
                            } else {
                                text.clone()
                            }
                        })
                        .collect::<Vec<_>>()
                        .join("\n");
                    if let Some(prepared) = store_candidate(song, cache, &text, "embedded")? {
                        return Ok(prepared);
                    }
                }
            }
            for key in [ItemKey::Lyrics, ItemKey::UnsyncLyrics] {
                for text in tag.get_strings(key) {
                    if let Some(prepared) = store_candidate(song, cache, text, "embedded")? {
                        return Ok(prepared);
                    }
                }
            }
        }
    }
    if let Some(sidecar) = load_sidecar_lrc(&song.file_hash)
        && let Some(prepared) = store_candidate(song, cache, &sidecar.text, "sidecar")?
    {
        return Ok(prepared);
    }
    if !matches!(song.origin, crate::song::SongOrigin::LocalFile)
        && let Some(source) = active_source().map_err(|e| e.to_string())?
    {
        for text in source.lyrics(song).map_err(|error| error.to_string())? {
            if let Some(prepared) = store_candidate(song, cache, &text, "server")? {
                return Ok(prepared);
            }
        }
    }
    Ok(PreparedLyrics::Missing)
}
