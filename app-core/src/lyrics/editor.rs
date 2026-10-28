use std::path::Path;

use serde::Deserialize;

use super::LyricsFile;
use crate::lrc;

#[derive(Deserialize)]
struct StoredWord {
    word: String,
    start: f64,
    end: f64,
}

#[derive(Deserialize)]
struct StoredSegment {
    text: String,
    start: f64,
    end: f64,
    #[serde(default)]
    words: Vec<StoredWord>,
}

#[derive(Deserialize)]
struct StoredTranscript {
    source: Option<String>,
    raw_lrc: Option<String>,
    segments: Vec<StoredSegment>,
}

fn tag(seconds: f64, opening: char, closing: char) -> Option<String> {
    if !seconds.is_finite() || seconds < 0.0 || seconds > u64::MAX as f64 / 1_000_000_000.0 {
        return None;
    }
    let nanos = (seconds * 1_000_000_000.0).round() as u64;
    let minutes = nanos / 60_000_000_000;
    let seconds = (nanos / 1_000_000_000) % 60;
    let fraction = nanos % 1_000_000_000;
    Some(format!(
        "{opening}{minutes:02}:{seconds:02}.{fraction:09}{closing}"
    ))
}

fn export_segment(segment: &StoredSegment) -> Option<String> {
    let mut text = tag(segment.start, '[', ']')?;
    if segment.words.is_empty() {
        text.push_str(&lrc::strip_timing_tags(&segment.text));
    } else {
        for word in &segment.words {
            text.push_str(&tag(word.start, '<', '>')?);
            text.push_str(&lrc::strip_timing_tags(&word.word));
            text.push_str(&tag(word.end, '<', '>')?);
        }
    }
    text.push_str(&tag(segment.end, '<', '>')?);
    Some(text)
}

pub(super) fn from_transcript(path: &Path) -> Option<LyricsFile> {
    let bytes = std::fs::read(path).ok()?;
    let transcript: StoredTranscript = serde_json::from_slice(&bytes).ok()?;
    let lines = transcript
        .segments
        .iter()
        .map(|segment| lrc::strip_timing_tags(&segment.text))
        .filter(|text| !text.trim().is_empty())
        .collect();
    let timed_lrc = if transcript.source.as_deref() == Some("lrc") {
        transcript
            .raw_lrc
            .filter(|raw| lrc::parse_lrc(raw).is_ok())
            .or_else(|| {
                let lines = transcript
                    .segments
                    .iter()
                    .map(export_segment)
                    .collect::<Option<Vec<_>>>()?;
                let text = lines.join("\n");
                lrc::parse_lrc(&text).ok().map(|_| text)
            })
    } else {
        None
    };
    Some(LyricsFile {
        lines,
        windows: None,
        timed_lrc,
    })
}
