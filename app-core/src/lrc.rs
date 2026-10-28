//! Standard and enhanced LRC, preserving authored text and token boundaries.

use serde::Serialize;

const LAST_SEGMENT_SECS: f64 = 4.0;
pub(crate) const LRC_PARSER_VERSION: u32 = 2;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct LrcWord {
    pub word: String,
    pub start: f64,
    pub end: f64,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct LrcSegment {
    pub text: String,
    pub start: f64,
    pub end: f64,
    pub words: Vec<LrcWord>,
}

#[derive(Debug, Clone)]
pub(crate) struct ParsedLrc {
    pub segments: Vec<LrcSegment>,
    pub raw_lrc: String,
}

struct RawLine {
    starts: Vec<f64>,
    body: String,
    number: usize,
}

#[derive(Clone)]
struct RawToken {
    start: f64,
    end: Option<f64>,
    text: String,
}

struct RawEntry {
    start: f64,
    end: Option<f64>,
    tokens: Vec<RawToken>,
}

fn parse_timestamp(body: &str) -> Option<f64> {
    let (minutes, rest) = body.trim().split_once(':')?;
    if minutes.is_empty() || !minutes.chars().all(|c| c.is_ascii_digit()) {
        return None;
    }
    let minutes: u64 = minutes.parse().ok()?;
    let (seconds, fraction) = rest
        .split_once(['.', ':', ','])
        .map_or((rest, ""), |(seconds, fraction)| (seconds, fraction));
    if seconds.is_empty()
        || !seconds.chars().all(|c| c.is_ascii_digit())
        || !fraction.chars().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    let seconds: u32 = seconds.parse().ok()?;
    if seconds >= 60 {
        return None;
    }
    let fraction: f64 = format!("0.{fraction}").parse().ok()?;
    let value = minutes as f64 * 60.0 + f64::from(seconds) + fraction;
    value.is_finite().then_some(value)
}

fn timestamp_candidate(body: &str) -> bool {
    body.trim()
        .chars()
        .next()
        .is_some_and(|c| c.is_ascii_digit() || c == '-' || c == '+')
        && body.contains(':')
}

pub(crate) fn has_timestamp_tags(text: &str) -> bool {
    text.match_indices(['[', '<']).any(|(index, opening)| {
        let close = if opening == "[" { ']' } else { '>' };
        let rest = &text[index + 1..];
        timestamp_candidate(rest.split(close).next().unwrap_or(rest))
    })
}

pub(crate) fn strip_timing_tags(text: &str) -> String {
    let mut plain = String::new();
    let mut index = 0;
    while index < text.len() {
        if let Ok(Some((_, length))) = time_tag(&text[index..]) {
            index += length;
        } else if let Some(character) = text[index..].chars().next() {
            plain.push(character);
            index += character.len_utf8();
        }
    }
    plain
}

fn time_tag(text: &str) -> Result<Option<(f64, usize)>, String> {
    let close = match text.chars().next() {
        Some('[') => ']',
        Some('<') => '>',
        _ => return Ok(None),
    };
    let Some(end) = text.find(close) else {
        return if timestamp_candidate(&text[1..]) {
            Err("Unclosed timestamp".into())
        } else {
            Ok(None)
        };
    };
    let body = &text[1..end];
    if !timestamp_candidate(body) {
        return Ok(None);
    }
    parse_timestamp(body)
        .map(|time| Some((time, end + 1)))
        .ok_or_else(|| "Invalid timestamp; use non-negative minutes and seconds below 60".into())
}

fn split_line(line: &str, number: usize, offset: &mut f64) -> Result<RawLine, String> {
    let mut starts = Vec::new();
    let mut rest = line.trim().trim_start_matches('\u{feff}');
    while rest.starts_with('[') {
        if let Some((time, length)) = time_tag(rest)? {
            starts.push(time);
            rest = rest[length..].trim_start();
            continue;
        }
        let Some(end) = rest.find(']') else {
            break;
        };
        let Some((key, value)) = rest[1..end].split_once(':') else {
            break;
        };
        if !key.chars().all(|c| c.is_ascii_alphabetic()) {
            break;
        }
        if key.eq_ignore_ascii_case("offset") {
            let milliseconds: f64 = value.trim().parse().map_err(|_| "Invalid LRC offset")?;
            if !milliseconds.is_finite() {
                return Err("LRC offset must be finite".into());
            }
            *offset = milliseconds / 1000.0;
        }
        rest = rest[end + 1..].trim_start();
    }
    Ok(RawLine {
        starts,
        body: rest.to_string(),
        number,
    })
}

fn push_token(
    tokens: &mut Vec<RawToken>,
    start: Option<f64>,
    end: Option<f64>,
    text: &mut String,
) -> Result<(), String> {
    if text.is_empty() || (tokens.is_empty() && text.trim().is_empty()) {
        text.clear();
        return Ok(());
    }
    let start = start.ok_or("Lyric text has no starting timestamp")?;
    tokens.push(RawToken {
        start,
        end,
        text: std::mem::take(text),
    });
    Ok(())
}

fn parse_body(line: &RawLine) -> Result<Option<RawEntry>, String> {
    let mut start = line.starts.first().copied();
    if start.is_none() && time_tag(&line.body)?.is_none() {
        return Ok(None);
    }
    let mut current = start;
    let mut tokens = Vec::new();
    let mut text = String::new();
    let mut index = 0;
    let mut last_marker = None;
    while index < line.body.len() {
        if let Some((time, length)) = time_tag(&line.body[index..])? {
            if current.is_some_and(|previous| time < previous) {
                return Err("Word timestamps must not go backwards within a lyric line".into());
            }
            push_token(&mut tokens, current, Some(time), &mut text)?;
            start.get_or_insert(time);
            current = Some(time);
            last_marker = Some(time);
            index += length;
        } else if let Some(character) = line.body[index..].chars().next() {
            text.push(character);
            index += character.len_utf8();
        }
    }
    let end = if text.trim().is_empty() {
        last_marker
    } else {
        None
    };
    push_token(&mut tokens, current, None, &mut text)?;
    if tokens.is_empty() {
        return Ok(None);
    }
    if let Some(first) = tokens.first_mut() {
        first.text = first.text.trim_start().to_string();
    }
    if let Some(last) = tokens.last_mut() {
        last.text = last.text.trim_end().to_string();
    }
    Ok(start.map(|start| RawEntry { start, end, tokens }))
}

fn shifted_time(time: f64, shift: f64) -> Result<f64, String> {
    let value = time + shift;
    if !value.is_finite() {
        return Err("Timestamp and offset exceed the supported range".into());
    }
    Ok(value.max(0.0))
}

fn expand_line(
    line: &RawLine,
    offset: f64,
    entries: &mut Vec<RawEntry>,
    breaks: &mut Vec<f64>,
) -> Result<(), String> {
    let Some(entry) = parse_body(line)? else {
        for time in &line.starts {
            breaks.push(shifted_time(*time, offset)?);
        }
        if let Some((time, _)) = time_tag(&line.body)? {
            breaks.push(shifted_time(time, offset)?);
        }
        return Ok(());
    };
    let starts = if line.starts.is_empty() {
        vec![entry.start]
    } else {
        line.starts.clone()
    };
    for start in starts {
        let shift = start - entry.start + offset;
        let tokens = entry
            .tokens
            .iter()
            .map(|token| {
                Ok(RawToken {
                    start: shifted_time(token.start, shift)?,
                    end: token.end.map(|end| shifted_time(end, shift)).transpose()?,
                    text: token.text.clone(),
                })
            })
            .collect::<Result<Vec<_>, String>>()?;
        entries.push(RawEntry {
            start: shifted_time(start, offset)?,
            end: entry.end.map(|end| shifted_time(end, shift)).transpose()?,
            tokens,
        });
    }
    Ok(())
}

fn segment_from_entry(entry: RawEntry, boundaries: &[f64]) -> LrcSegment {
    let last_start = entry.tokens.last().map_or(entry.start, |token| token.start);
    let end = entry.end.unwrap_or_else(|| {
        let next = boundaries.partition_point(|boundary| *boundary <= last_start);
        boundaries
            .get(next)
            .copied()
            .unwrap_or(last_start + LAST_SEGMENT_SECS)
    });
    let text = entry
        .tokens
        .iter()
        .map(|token| token.text.as_str())
        .collect::<String>();
    let words = entry
        .tokens
        .iter()
        .enumerate()
        .map(|(index, token)| LrcWord {
            word: token.text.clone(),
            start: token.start,
            end: token
                .end
                .unwrap_or_else(|| entry.tokens.get(index + 1).map_or(end, |next| next.start)),
        })
        .collect();
    LrcSegment {
        text,
        start: entry.start,
        end,
        words,
    }
}

pub(crate) fn parse_lrc(text: &str) -> Result<ParsedLrc, String> {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut offset = 0.0;
    let mut lines = Vec::new();
    for (index, line) in normalized.lines().enumerate() {
        lines.push(
            split_line(line, index + 1, &mut offset)
                .map_err(|error| format!("LRC line {}: {error}", index + 1))?,
        );
    }
    let mut entries = Vec::new();
    let mut boundaries = Vec::new();
    for line in &lines {
        expand_line(line, offset, &mut entries, &mut boundaries)
            .map_err(|error| format!("LRC line {}: {error}", line.number))?;
    }
    if entries.is_empty() {
        return Err("No timestamped lyric lines found in the provided LRC".into());
    }
    entries.sort_by(|a, b| a.start.total_cmp(&b.start));
    boundaries.extend(entries.iter().map(|entry| entry.start));
    boundaries.sort_by(f64::total_cmp);
    Ok(ParsedLrc {
        segments: entries
            .into_iter()
            .map(|entry| segment_from_entry(entry, &boundaries))
            .collect(),
        raw_lrc: text.to_string(),
    })
}
