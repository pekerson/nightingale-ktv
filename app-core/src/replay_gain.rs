use std::path::Path;

use lofty::{file::TaggedFileExt, tag::ItemKey};

#[derive(Clone, Copy)]
pub(crate) struct ReplayGain {
    pub gain_db: f64,
    pub peak: Option<f64>,
}

fn gain_db(value: &str) -> Option<f64> {
    let normalized = value.trim().to_ascii_lowercase();
    let number = normalized.strip_suffix("db").unwrap_or(&normalized).trim();
    let gain = number.parse::<f64>().ok()?;
    (gain.is_finite() && (-60.0..=30.0).contains(&gain)).then_some(gain)
}

fn peak(value: &str) -> Option<f64> {
    let peak = value.trim().parse::<f64>().ok()?;
    (peak.is_finite() && peak > 0.0 && peak <= 10.0).then_some(peak)
}

/// ReplayGain belongs to the source mix, not to transformed stem files. A
/// track value wins over an album value so individual queued songs normalize
/// independently. Invalid or unreadable metadata leaves playback unchanged.
pub(crate) fn read(path: &Path) -> Option<ReplayGain> {
    let tagged = lofty::read_from_path(path).ok()?;
    let tags = tagged.tags();
    let track_gain = tags.iter().find_map(|tag| {
        tag.get_strings(ItemKey::ReplayGainTrackGain)
            .find_map(gain_db)
    });
    let (gain_db, peak_key) = match track_gain {
        Some(gain) => (gain, ItemKey::ReplayGainTrackPeak),
        None => (
            tags.iter().find_map(|tag| {
                tag.get_strings(ItemKey::ReplayGainAlbumGain)
                    .find_map(gain_db)
            })?,
            ItemKey::ReplayGainAlbumPeak,
        ),
    };
    let peak = tags
        .iter()
        .find_map(|tag| tag.get_strings(peak_key).find_map(peak));
    Some(ReplayGain { gain_db, peak })
}
