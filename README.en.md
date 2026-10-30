<p align="center">
  <img src="client/src/assets/images/logo.png" alt="Nightingale" width="400">
</p>

<p align="right">
  <a href="README.md"><kbd>简体中文</kbd></a>
  <a href="README.en.md"><kbd>English</kbd></a>
</p>

# Nightingale Home KTV Edition

This is a personal modification of [Nightingale](https://github.com/rzru/nightingale) **v1.3.0**, not an official release by the original maintainers. The upstream project turns an existing music library into karaoke by analyzing songs, separating vocals, preparing synchronized lyrics, and providing singing, pitch scoring, and song requests. This repository keeps the upstream application source and adds playback controls, lyric handling, MV support, audio routing, and interface changes for home KTV use.

- **Upstream repository:** [rzru/nightingale](https://github.com/rzru/nightingale)
- **Upstream v1.3.0:** [release page](https://github.com/rzru/nightingale/releases/tag/v1.3.0)
- **Upstream website and documentation:** [nightingale.cafe](https://nightingale.cafe/) · [user guide](https://nightingale.cafe/docs/)
- **This repository:** [pekerson/nightingale-ktv](https://github.com/pekerson/nightingale-ktv)
- **License:** GPL-3.0-or-later, retained from upstream; see [LICENSE](LICENSE).
- **Windows x64 test installer (with per-song MV timing offset):** [v1.3.0-ktv20-test Release](https://github.com/pekerson/nightingale-ktv/releases/tag/v1.3.0-ktv20-test). Installer SHA-256: `BEAEA9A066512EAC36C49B54E962267B8DE6371A41905F3B73ADEACE6EF2B859`. The matching source ZIP and checksum file are on the same release page.

> This repository is a trimmed source snapshot of the modified edition. It includes application source, build configuration, deployment scripts, and the license. It does not include the upstream website, GitHub Actions, agent rules, or build caches. The installer is a separate Release asset, not a file in the source tree. “v20” below is a local modification-stage number; the application manifests still use the upstream 1.3.0 version number.

## Development approach and support

All code changes to the upstream project in this repository were made with AI based on functional requirements I provided. My role was limited to proposing those requirements and testing the software's features. I did not write or modify the code, and I am not able to resolve bugs that may occur. Therefore, this project does not provide technical support or ongoing upgrade or update services.

If you need different functionality, you may use AI to modify this repository's source code, then rebuild, package, and install your own version.

## Features already present upstream

The following summarizes the upstream v1.3.0 [README](https://github.com/rzru/nightingale/blob/v1.3.0/README.md). These are inherited capabilities, not additions made in this edition.

| Area | Upstream features |
| --- | --- |
| Library sources | Scan local audio, video, and UltraStar files; connect Plex, Jellyfin, or Navidrome; browse existing folder and server playlists. |
| Song analysis | Separate vocals and accompaniment using UVR Karaoke or Demucs; process songs through a local Python analyzer with caching. |
| Lyrics | Use LRCLIB or manually supplied/pasted LRC, or automatically transcribe and align word-timed lyrics; highlight lyrics during singing. |
| Singing and scoring | Score microphone pitch; adjust song key, tempo, and guide-vocal volume; monitor the microphone and compensate for latency. |
| Queue and multiplayer | Playback queue, Session mode, profiles, leaderboards, and separate microphones for two to four local singers. |
| Stage visuals | Video included in the song, GPU shaders, Pixabay loops, or custom image/video/shader backgrounds; lyric and pitch-graph position and scale controls. |
| Delivery | Tauri desktop and self-hosted web applications share a Rust core and React frontend; upstream publishes Windows, macOS, and Linux desktop builds. |

## Additions and changes in this edition

### Playback controls and scoring

- **Draggable singing timeline:** The upstream singing view showed text time only. This edition lets you seek by dragging the timeline and shows elapsed and total time in the progress area.
- **Progress-area controls:** Pause/resume, back or forward 5 seconds, and back or forward 20 seconds; replay, skip intro, skip outro, and skip song share another row.
- **Pause and exit are separate:** The ordinary pause button and Space only pause or resume without opening a dialog. “Exit playback” in the playback controls and Esc open a confirmation dialog with continue, exit, and replay actions.
- **Replay the current song:** Start again from the beginning while singing, paused, or on the results page. Current-attempt state resets; the queue and previously saved scores remain.
- **Scoring after seeking:** A setting determines whether a song still counts toward scores after dragging the timeline or using a seek button. It is off by default so practice seeks do not enter formal scores.
- **Skip song and results:** Skip song ends the current attempt immediately and shows results. Natural completion, skip song, and skip outro share the same settlement path. Without a next queued song, the results page remains visible.
- **Automatic next song:** When a next queued song exists and the results page is untouched, playback advances after about 5 seconds by default. This can be disabled, and the delay can be set to 1–60 seconds. Clicking, pressing a key, or scrolling on the results page cancels that automatic advance.

### Song requests, playlists, and library operations

- **Quick queue and move to top:** Add a song to the playback queue with one click from the library or song details; move any queued song to the top with one click.
- **Automatic analysis per playlist:** Each playlist can inherit the global setting, enable analysis, or disable it. Enabling immediately queues existing unanalyzed songs; newly added songs are analyzed after synchronization, while completed analyses are not repeated.
- **Bulk selection:** A Multi-select button beside search expands the action toolbar. Select songs in grid, table, and across result pages for bulk analysis, analysis cancellation, or cache clearing. Clearing analysis cache does not delete source songs.

### Lyrics, LRC, intro, and outro

- **Prefer available lyrics:** Before analysis, check valid saved transcripts or manually edited lyrics, then embedded audio lyrics, a matching sidecar LRC, and lyrics from Jellyfin/Navidrome. Use AI lyric recognition only if none is available. Other song analysis still runs when valid lyrics are found.
- **Enhanced LRC support:** Handle line-start and line-end timestamps, word/character timestamps, repeated times, and offsets. Playback shows clean lyric text; the editor also removes timing tags from visible text while retaining an editable original timeline.
- **Intro detection:** Combine the first vocal interval in the separated dry-vocal stem with the first lyric timestamp, avoiding production credits at the start. Skip intro defaults to three seconds before the first line, adjustable from 0–10 seconds. Outro skip uses valid final-line timing.
- **Per-song manual calibration:** Set the first-line start time in the lyric editor using separate minute, second, and millisecond fields displayed as `XX:XX.XXX`. Manual calibration takes priority over automatic detection and can be reset.

### Audio devices, mixing, and key

- **Three independent volume controls:** Adjust accompaniment, dry vocals, and microphone monitoring during playback. Each starts at 100% for a new song or replay. For songs with a separate dry-vocal stem, its volume changes the balance between the original vocal and accompaniment while singing.
- **ReplayGain normalization:** Enable it in Settings (off by default). The player reads track ReplayGain from the original song, falling back to album gain when track gain is absent. The preamp is adjustable from 0 to 10 dB (default 0 dB). Accompaniment and dry vocals receive the same gain; microphone monitoring is unaffected. Songs without valid tags keep their original level, and a valid peak tag limits amplification to reduce clipping risk.
- **Device selection and dual output:** Select a microphone and up to two speakers from drop-down lists. Choose independently whether each speaker plays accompaniment, dry vocals, and microphone monitoring.
- **Live key adjustment:** The singing view shows the current key and has key-up/key-down buttons. Playback position and current attempt state are preserved while changing key.
- **Configurable shortcuts:** Rebind 24 existing keyboard actions in Settings. Defaults include Space for pause/resume, Left/Right for seeking 5 seconds, Esc for exit confirmation, and Up/Down for accompaniment volume in 10% steps. With NumLock off, numpad 8/2 also act as Up/Down.

### MV and singing interface

- **External MV per song:** A separate Edit MV dialog in song details lets you choose a video, inspect automatic matching, and enable or disable MV for that song. An MV directory can be configured; a manual selection takes priority over automatic matching.
- **Mapped drives and compatible playback:** Automatic matching requires a video file stem exactly equal to the song title or “Title - Artist.” Supported formats are MP4, MKV, AVI, WebM, MOV, and M4V. Windows mapped drives such as K: are scanned using their original paths; files are cached locally and remuxed or transcoded when necessary. The MV supplies video only; audio still comes from the library song. The entire picture is shown at its original aspect ratio with black bars, and the rest of the song is black if the MV ends early. Each song can have a signed MV timing offset in Edit MV: a positive value skips the beginning of the video, while a negative value shows black before the video starts. Seconds and milliseconds have separate 0–1000 inputs.
- **Collapsible progress area:** Playback controls are expanded by default. The progress, button, and volume area is expanded by default too, but can be collapsed; its state survives song changes and restarts. Song title and artist remain visible.
- **Lyrics and pitch graph:** Each can be enabled or disabled; associated position settings collapse when disabled. Each has horizontal/vertical anchors and X/Y offsets. A central line in the pitch graph marks now, with history on the left and upcoming reference pitch on the right. The default time span is about twice the upstream span and is configurable; pitch-graph scale reaches 500%.
- **Interface sizing and languages:** Progress area, right-side status text, and playback-control buttons each scale from 50% to 200%; application font size ranges from 12 to 24. Switch between English and Simplified Chinese with the choice retained. The separate playback window keeps a transparent but draggable top region and symmetrical rounded window-button borders.

## Complete feature overview of the current edition

This section combines inherited upstream capabilities with this edition’s additions.

| Use case | Current capabilities |
| --- | --- |
| Build a library | Import local audio, video, and UltraStar files or connect Plex, Jellyfin, and Navidrome; browse folder and server playlists; search, select, and manage songs in bulk. |
| Prepare songs | Separate vocals/accompaniment, recognize and align lyrics, analyze reference pitch, and cache results; automatically analyze existing and new songs according to global or per-playlist settings. |
| Manage lyrics | Use LRCLIB, manual lyrics, embedded audio lyrics, matching LRC, server lyrics, or AI recognition; edit standard/enhanced word-timed LRC and calibrate the first line per song. |
| Sing and practice | Follow synchronized lyrics, score microphone pitch, sing with multiple players, adjust key and tempo; drag the timeline, pause, seek, replay, skip intro/outro, or skip song; choose whether a song with manual seeking counts toward scores. |
| Mix and route audio | Master volume, separate accompaniment/dry-vocal/microphone-monitor volumes, optional ReplayGain normalization with a 0–10 dB preamp, and microphone latency compensation; select a microphone and up to two output devices with independent source selection; change key while singing. |
| Queue and scores | Playback queue, quick add and move-to-top, Session mode, profiles, and leaderboards; see results at completion or after skipping, and optionally auto-advance to the next song. |
| Visuals and MV | Song video, shaders, Pixabay and custom backgrounds; associate a separate silent MV per song; control lyric and pitch-graph visibility, position, and size; preview upcoming reference pitch and collapse the progress area. |
| Input and delivery | English and Chinese interface, configurable shortcuts, keyboard/gamepad/touch input; retains desktop and self-hosted web architecture. |

## Running from this repository

This trimmed source repository includes `app-api/`, `app-core/`, `client/`, `xtask/`, and related build configuration. It omits the upstream `site/`, GitHub release workflows, and agent-rule files. **Upstream downloads, build badges, and release procedures do not represent this edition.**

The upstream project requires Rust 1.94.1 (pinned in `rust-toolchain.toml`), Node.js 22.12+, and pnpm 11.2.2. For Windows desktop development, try from the repository root:

```powershell
pnpm --dir client install --frozen-lockfile --ignore-scripts
cargo desktop dev
```

This trimmed snapshot omits the upstream agent rules and Git hooks, but `client/package.json` still references their install scripts; `--ignore-scripts` avoids those hooks during dependency installation. For frontend checks, use `pnpm --dir client quality:web`. The complete `quality` command includes omitted rule checks and does not apply to this snapshot. The modified app and installer have mainly been validated on **Windows x64**. Other platforms and self-hosted behavior claimed by upstream have not been revalidated platform by platform for this edition.

### Directory map

| Path | Contents |
| --- | --- |
| `app-core/` | Rust core, song sources, database, lyrics/MV associations, analyzer, and media processing |
| `app-api/` | Shared command interface, configuration, and events |
| `client/src/` | React UI, playback, library, lyrics, settings, and audio routing |
| `client/src-tauri/` | Tauri desktop adapter and resources |
| `client/src-server/` | Self-hosted web server adapter |
| `xtask/` | Desktop build helper |
| `docker/`, `scripts/` | Self-hosted deployment files |

## Validation scope and known limits

- This README describes capabilities in the source, **not full validation on every platform and hardware combination**. The Windows x64 modified build and main UI flows have been tested; simultaneous output on two physical speakers, different physical microphones, and other platforms still need verification on target devices.
- Dual-output routing depends on the OS and browser/desktop runtime supporting selected output devices. A song without a separate dry-vocal stem cannot gain isolated original vocals from a volume slider alone.
- Intro/outro detection depends on valid lyric timing and separated-stem quality; manually calibrate the first line for songs where automatic detection is inaccurate.
- An associated MV is **silent video** and does not replace the library song audio. This edition does not add singing recording or playback of a recording.
- The Windows x64 test installer and matching source ZIP are available in the [v20 test Release](https://github.com/pekerson/nightingale-ktv/releases/tag/v1.3.0-ktv20-test), outside Git source history. This repository is now public, so anyone can download them; the release remains marked as a prerelease.

## Attribution and license

Thanks to the [upstream Nightingale project and contributors](https://github.com/rzru/nightingale). This edition retains the upstream [GPL-3.0-or-later license](LICENSE). Upstream website, documentation, downloads, and community links belong to the original project; this repository’s contents govern its own feature descriptions, validation scope, and release files.
