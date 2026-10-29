import { DEFAULT_PLAYBACK_SCALE } from '@/features/playback/lib/display-scale';
import {
  DEFAULT_MIC_LATENCY_COMPENSATION_SEC,
  MAX_MIC_LATENCY_COMPENSATION_SEC,
  PITCH_GRAPH_WINDOW_DEFAULT_SEC,
  PITCH_GRAPH_WINDOW_MIN_SEC,
  PITCH_GRAPH_WINDOW_MAX_SEC,
} from '@/features/playback/lib/pitch/constants';
import type { AppConfig } from '@/types/AppConfig';

export { PLAYBACK_SCALE_MAX, PLAYBACK_SCALE_MIN } from '@/features/playback/lib/display-scale';

export const PLAYBACK_NUMERIC_DEFAULTS = {
  playback_progress_scale: 1,
  playback_status_scale: 1,
  playback_controls_scale: 1,
  intro_skip_lead_sec: 3,
  queue_auto_advance_delay_sec: 5,
  lyrics_offset_x: 0,
  lyrics_offset_y: 0,
  pitch_graph_offset_x: 0,
  pitch_graph_offset_y: 0,
  pitch_graph_window_sec: PITCH_GRAPH_WINDOW_DEFAULT_SEC,
};

export type PlaybackRangeKey = keyof typeof PLAYBACK_NUMERIC_DEFAULTS;
export type PlaybackRangeValues = Record<PlaybackRangeKey, number>;

export type SettingsTab = 'general' | 'playback' | 'analysis' | 'shortcuts';
export type SettingsOption = {
  value: string;
  label: string;
  description?: string;
  translateLabel?: boolean;
};

export const SETTINGS_TABS: { value: SettingsTab; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'playback', label: 'Playback' },
  { value: 'analysis', label: 'Analysis' },
  { value: 'shortcuts', label: 'Keyboard shortcuts' },
];

export const SEPARATORS: SettingsOption[] = [
  {
    value: 'karaoke',
    label: 'UVR Karaoke',
    description: 'Usually separates more cleanly, but can occasionally slip on tricky parts.',
  },
  {
    value: 'demucs',
    label: 'Demucs',
    description:
      'Smoother and more consistent with fewer abrupt artifacts, though slightly less crisp overall.',
  },
];

export const ASR_ENGINES: SettingsOption[] = [
  {
    value: 'whisper',
    label: 'Whisper',
    description: 'Works in any language and lets you pick a model size below.',
  },
  {
    value: 'parakeet',
    label: 'Parakeet v3 (Experimental)',
    description:
      'Much faster and produces its own word timings (skipping alignment), but only covers 25 European languages. Whisper takes over for anything else.',
  },
];

export const ALIGN_BACKENDS: SettingsOption[] = [
  {
    value: 'whisperx',
    label: 'WhisperX',
    description: 'The reliable default, timing words with a proven decoder.',
  },
  {
    value: 'ctc',
    label: 'CTC Forced Alignment (Experimental)',
    description:
      'Calculates word start/end points with a different algorithm, and runs much faster on GPU and Apple Silicon. Falls back to WhisperX if a line trips it up.',
  },
  {
    value: 'qwen',
    label: 'Qwen Forced Alignment (Experimental)',
    description:
      'A fast AI model covering 11 languages. Timing quality varies song to song, but it can do better on Chinese, Japanese, and Korean. Falls back to WhisperX otherwise.',
  },
];

export const MODELS = ['large-v3', 'large-v3-turbo', 'medium', 'small', 'base', 'tiny'];

export const PLAYBACK_MODES: SettingsOption[] = [
  {
    value: 'classic',
    label: 'Classic mode',
    description: 'Playback replaces the menu in the current window.',
  },
  {
    value: 'session',
    label: 'Session mode',
    description: 'Playback uses a separate window while the menu manages the queue.',
  },
];

export const LYRICS_VERTICAL_POSITIONS: SettingsOption[] = [
  { value: 'bottom', label: 'Bottom' },
  { value: 'center', label: 'Center' },
  { value: 'top', label: 'Top' },
];

export const LYRICS_HORIZONTAL_POSITIONS: SettingsOption[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];

export const LYRICS_ROMANIZATION_MODES: SettingsOption[] = [
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
];

export const DEFAULTS = {
  app_font_size: 16,
  shortcut_bindings: null,
  pitch_graph_horizontal_position: null,
  pitch_graph_vertical_position: null,
  separator: 'karaoke',
  asr_engine: 'whisper',
  align_backend: 'whisperx',
  vocal_detection_threshold_pct: 0.15,
  whisper_model: 'large-v3',
  beam_size: 8,
  batch_size: 8,
  mic_monitor_gain: 1,
  mic_latency_compensation_sec: DEFAULT_MIC_LATENCY_COMPENSATION_SEC,
  combine_multi_channel: true,
  multiplayer_combine_multi_channel: true,
  auto_analyze: false,
  mv_directory: null,
  master_volume: 1,
  replay_gain_enabled: false,
  replay_gain_preamp_db: 0,
  instrumental_volume: 1,
  guide_volume: 1,
  audio_outputs: null,
  preferred_mic: null,
  last_background: { kind: 'built_in_shader', id: 'plasma' },
  playback_mode: 'classic',
  score_after_seek: false,
  queue_auto_advance: true,
  ...PLAYBACK_NUMERIC_DEFAULTS,
  lyrics_vertical_position: 'bottom',
  lyrics_horizontal_position: 'center',
  lyrics_scale: DEFAULT_PLAYBACK_SCALE,
  pitch_graph_scale: DEFAULT_PLAYBACK_SCALE,
  show_lyrics: true,
  show_pitch_graph: true,
  lyrics_romanization_mode: 'enabled',
} satisfies Pick<
  AppConfig,
  | 'app_font_size'
  | 'shortcut_bindings'
  | 'pitch_graph_horizontal_position'
  | 'pitch_graph_vertical_position'
  | 'separator'
  | 'asr_engine'
  | 'align_backend'
  | 'vocal_detection_threshold_pct'
  | 'whisper_model'
  | 'beam_size'
  | 'batch_size'
  | 'mic_monitor_gain'
  | 'mic_latency_compensation_sec'
  | 'combine_multi_channel'
  | 'multiplayer_combine_multi_channel'
  | 'auto_analyze'
  | 'mv_directory'
  | 'master_volume'
  | 'replay_gain_enabled'
  | 'replay_gain_preamp_db'
  | 'instrumental_volume'
  | 'guide_volume'
  | 'audio_outputs'
  | 'preferred_mic'
  | 'last_background'
  | 'playback_mode'
  | 'score_after_seek'
  | 'queue_auto_advance'
  | PlaybackRangeKey
  | 'lyrics_vertical_position'
  | 'lyrics_horizontal_position'
  | 'lyrics_scale'
  | 'pitch_graph_scale'
  | 'show_lyrics'
  | 'show_pitch_graph'
  | 'lyrics_romanization_mode'
>;

export const MIC_MONITOR_GAIN_STEP = 0.01;
export const MIC_MONITOR_GAIN_MAX = 2;
export const MIC_LATENCY_STEP = 0.005;
export const MIC_LATENCY_MAX = MAX_MIC_LATENCY_COMPENSATION_SEC;
export const PLAYBACK_SCALE_STEP = 0.05;
// Vocal-detection threshold is stored as a fraction of peak RMS (0-1) but shown
// as a percentage. Capped at 60% since anything higher trims almost everything.
export const VOCAL_THRESHOLD_STEP = 0.01;
export const VOCAL_THRESHOLD_MIN = 0;
export const VOCAL_THRESHOLD_MAX = 0.6;
export const NUMBER_PICKER_SIZE = 16;

export const NAV = {
  tabSegment: 0,
  general: {
    language: 1,
    window: 2,
    microphone: 3,
    micMonitorGain: 4,
    micLatency: 5,
    micTest: 6,
    speakerOne: 7,
    speakerOneSources: 8,
    speakerTwo: 9,
    speakerTwoSources: 10,
    refreshSpeakers: 11,
  },
  playback: {
    background: 1,
    mode: 2,
    scoreAfterSeek: 3,
    autoAdvance: 4,
    introSkipLead: 5,
    autoAdvanceDelay: 6,
    masterVolume: 7,
    replayGainEnabled: 8,
    replayGainPreamp: 9,
    showLyrics: 10,
    lyricsVerticalPosition: 11,
    lyricsHorizontalPosition: 12,
    lyricsOffsetX: 13,
    lyricsOffsetY: 14,
    lyricsScale: 15,
    lyricsRomanizationMode: 16,
    showPitchGraph: 17,
    pitchHorizontal: 18,
    pitchVertical: 19,
    pitchGraphOffsetX: 20,
    pitchGraphOffsetY: 21,
    pitchGraphScale: 22,
    pitchGraphWindow: 23,
    progressScale: 24,
    statusScale: 25,
    controlsScale: 26,
  },
} as const;

export const PLAYBACK_RANGE_KEYS: readonly PlaybackRangeKey[] = [
  'playback_progress_scale',
  'playback_status_scale',
  'playback_controls_scale',
  'intro_skip_lead_sec',
  'queue_auto_advance_delay_sec',
  'lyrics_offset_x',
  'lyrics_offset_y',
  'pitch_graph_offset_x',
  'pitch_graph_offset_y',
  'pitch_graph_window_sec',
];

type PlaybackRangeDefinition = {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  segment: number;
  unit: 'seconds' | 'offset' | 'scale';
};

export const PLAYBACK_RANGES: Record<PlaybackRangeKey, PlaybackRangeDefinition> = {
  intro_skip_lead_sec: {
    label: 'Skip intro lead time',
    hint: 'Jump this many seconds before the first lyric line; use the vocal start if lyric timing is unavailable.',
    min: 0,
    max: 10,
    step: 0.1,
    segment: NAV.playback.introSkipLead,
    unit: 'seconds',
  },
  playback_progress_scale: {
    label: 'Progress and transport size',
    hint: 'Size of the left progress bar, buttons and volume controls.',
    min: 0.5,
    max: 2,
    step: 0.05,
    segment: NAV.playback.progressScale,
    unit: 'scale',
  },
  playback_status_scale: {
    label: 'Playback status text size',
    hint: 'Size of the status text on the right during playback.',
    min: 0.5,
    max: 2,
    step: 0.05,
    segment: NAV.playback.statusScale,
    unit: 'scale',
  },
  playback_controls_scale: {
    label: 'Playback control button size',
    hint: 'Size of the playback control buttons on the right.',
    min: 0.5,
    max: 2,
    step: 0.05,
    segment: NAV.playback.controlsScale,
    unit: 'scale',
  },
  queue_auto_advance_delay_sec: {
    label: 'Next song delay',
    hint: 'Wait on the score page before playing the next queued song.',
    min: 1,
    max: 60,
    step: 1,
    segment: NAV.playback.autoAdvanceDelay,
    unit: 'seconds',
  },
  lyrics_offset_x: {
    label: 'Lyrics horizontal offset',
    hint: 'Move left or right relative to the default position. Zero restores the default.',
    min: -100,
    max: 100,
    step: 1,
    segment: NAV.playback.lyricsOffsetX,
    unit: 'offset',
  },
  lyrics_offset_y: {
    label: 'Lyrics vertical offset',
    hint: 'Move up or down relative to the default position. Zero restores the default.',
    min: -100,
    max: 100,
    step: 1,
    segment: NAV.playback.lyricsOffsetY,
    unit: 'offset',
  },
  pitch_graph_offset_x: {
    label: 'Pitch graph horizontal offset',
    hint: 'Move left or right relative to the default position. Zero restores the default.',
    min: -100,
    max: 100,
    step: 1,
    segment: NAV.playback.pitchGraphOffsetX,
    unit: 'offset',
  },
  pitch_graph_offset_y: {
    label: 'Pitch graph vertical offset',
    hint: 'Move up or down relative to the default position. Zero restores the default.',
    min: -100,
    max: 100,
    step: 1,
    segment: NAV.playback.pitchGraphOffsetY,
    unit: 'offset',
  },
  pitch_graph_window_sec: {
    label: 'Pitch graph time span',
    hint: 'The center line is now. History appears on the left and upcoming reference pitch on the right.',
    min: PITCH_GRAPH_WINDOW_MIN_SEC,
    max: PITCH_GRAPH_WINDOW_MAX_SEC,
    step: 0.1,
    segment: NAV.playback.pitchGraphWindow,
    unit: 'seconds',
  },
};

// The Whisper-only "Model size" + "Beam Size" fields sit right after the
// transcription model, so every later field shifts by two segments when
// Parakeet hides them. Fields that aren't rendered map to -1 so focus rings
// never match them.
export function getAnalysisNav(isParakeet: boolean) {
  return isParakeet
    ? {
        separator: 1,
        asrEngine: 2,
        whisperModel: -1,
        beamSize: -1,
        alignBackend: 3,
        autoAnalyze: 4,
        vocalThreshold: 5,
        batchSize: 6,
        mvDirectory: 7,
      }
    : {
        separator: 1,
        asrEngine: 2,
        whisperModel: 3,
        beamSize: 4,
        alignBackend: 5,
        autoAnalyze: 6,
        vocalThreshold: 7,
        batchSize: 8,
        mvDirectory: 9,
      };
}

export function getSettingsStops({
  tab,
  isParakeet,
  hasMultiChannelInput,
  hasSecondOutput,
  showLyrics,
  showPitchGraph,
}: {
  tab: SettingsTab;
  isParakeet: boolean;
  hasMultiChannelInput: boolean;
  hasSecondOutput: boolean;
  showLyrics: boolean;
  showPitchGraph: boolean;
}) {
  if (tab === 'general') {
    return [
      4,
      1,
      2,
      hasMultiChannelInput ? 2 : 1,
      1,
      2,
      2,
      1,
      3,
      1,
      ...(hasSecondOutput ? [3] : []),
      1,
      1,
      2,
    ];
  }
  if (tab === 'playback') {
    return [
      4,
      2,
      1,
      2,
      2,
      1,
      1,
      1,
      2,
      1,
      2,
      ...(showLyrics ? [1, 1, 1, 1, 1, 2] : [0, 0, 0, 0, 0, 0]),
      2,
      ...(showPitchGraph ? [1, 1, 1, 1, 1, 1] : [0, 0, 0, 0, 0, 0]),
      1,
      1,
      1,
      2,
    ];
  }
  if (tab === 'shortcuts') {
    return [4, 2];
  }

  return isParakeet
    ? [4, 1, 1, 1, 2, 1, NUMBER_PICKER_SIZE, 2, 2]
    : [4, 1, 1, 1, NUMBER_PICKER_SIZE, 1, 2, 1, NUMBER_PICKER_SIZE, 2, 2];
}
