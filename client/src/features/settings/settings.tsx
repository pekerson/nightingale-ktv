import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { setFullScreen, isFullScreen as tauriIsFullScreen } from '@/bridge/fullScreen';
import { isTauri } from '@/bridge/runtime';
import {
  clampPlaybackScale,
  clampPlaybackPanelScale,
  clampPitchGraphScale,
  clampPlaybackOffset,
  PITCH_GRAPH_SCALE_MAX,
  DEFAULT_PLAYBACK_SCALE,
} from '@/features/playback/lib/display-scale';
import { clampPitchGraphWindow } from '@/features/playback/lib/pitch/constants';
import { BackgroundSettings } from '@/features/settings/components/background-settings';
import {
  ALIGN_BACKENDS,
  ASR_ENGINES,
  DEFAULTS,
  LYRICS_HORIZONTAL_POSITIONS,
  LYRICS_ROMANIZATION_MODES,
  LYRICS_VERTICAL_POSITIONS,
  MODELS,
  NAV,
  PLAYBACK_MODES,
  PLAYBACK_NUMERIC_DEFAULTS,
  PLAYBACK_RANGES,
  PLAYBACK_RANGE_KEYS,
  PLAYBACK_SCALE_MAX,
  PLAYBACK_SCALE_MIN,
  PLAYBACK_SCALE_STEP,
  SEPARATORS,
  SETTINGS_TABS,
  VOCAL_THRESHOLD_MAX,
  getAnalysisNav,
  type SettingsTab,
  type PlaybackRangeKey,
  type PlaybackRangeValues,
} from '@/features/settings/components/constants';
import {
  AppFontSetting,
  PitchAnchorSettings,
} from '@/features/settings/components/interface-sizing-settings';
import { MicrophoneSettings } from '@/features/settings/components/microphone-settings';
import {
  AutoAdvanceSetting,
  PlaybackRangeSetting,
} from '@/features/settings/components/playback-extra-settings';
import { PlaybackPreview } from '@/features/settings/components/playback-preview';
import {
  Hint,
  NumberButtonGroup,
  PageHeader,
  SettingsButtonGroup,
  SettingsSelect,
} from '@/features/settings/components/settings-controls';
import { ShortcutSettings } from '@/features/settings/components/shortcut-settings';
import { SpeakerSettings } from '@/features/settings/components/speaker-settings';
import { useSettingsNavigation } from '@/features/settings/hooks/use-settings-navigation';
import { Button } from '@/shared/components/ui/button';
import { ButtonGroup } from '@/shared/components/ui/button-group';
import { Field, FieldGroup } from '@/shared/components/ui/field';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { useConfig } from '@/shared/config/use-config';
import { useConfigMutation } from '@/shared/config/use-config-mutation';
import { interfaceFontSize } from '@/shared/config/use-interface-font';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { AppConfig } from '@/types/AppConfig';

const generalSettings = (config: AppConfig | undefined) => {
  if (!config) {
    return {
      fullscreen: undefined,
      preferredMic: null,
      combineMultiChannel: true,
      micMonitorGain: DEFAULTS.mic_monitor_gain,
      micLatency: DEFAULTS.mic_latency_compensation_sec,
    };
  }

  return {
    fullscreen: config.fullscreen,
    preferredMic: config.preferred_mic,
    combineMultiChannel: config.combine_multi_channel ?? true,
    micMonitorGain: config.mic_monitor_gain ?? DEFAULTS.mic_monitor_gain,
    micLatency: config.mic_latency_compensation_sec ?? DEFAULTS.mic_latency_compensation_sec,
  };
};

const speakerSettings = (config: AppConfig | undefined) => ({
  routes: config?.audio_outputs ?? null,
  hasSecondOutput: (config?.audio_outputs?.length ?? 0) > 1,
});

const replayGainSettings = (config: AppConfig | undefined) => ({
  replayGainEnabled: config?.replay_gain_enabled ?? DEFAULTS.replay_gain_enabled,
  replayGainPreampDb: Math.min(
    10,
    Math.max(0, config?.replay_gain_preamp_db ?? DEFAULTS.replay_gain_preamp_db),
  ),
});

const playbackSettings = (config: AppConfig | undefined) => {
  if (!config) {
    return {
      mode: DEFAULTS.playback_mode,
      scoreAfterSeek: DEFAULTS.score_after_seek,
      masterVolume: DEFAULTS.master_volume,
      replayGainEnabled: DEFAULTS.replay_gain_enabled,
      replayGainPreampDb: DEFAULTS.replay_gain_preamp_db,
      lyricsVertical: DEFAULTS.lyrics_vertical_position,
      lyricsHorizontal: DEFAULTS.lyrics_horizontal_position,
      lyricsScale: DEFAULT_PLAYBACK_SCALE,
      pitchGraphScale: DEFAULT_PLAYBACK_SCALE,
      lyricsRomanizationMode: DEFAULTS.lyrics_romanization_mode,
      showLyrics: DEFAULTS.show_lyrics,
      showPitchGraph: DEFAULTS.show_pitch_graph,
    };
  }

  return {
    mode: config.playback_mode ?? DEFAULTS.playback_mode,
    scoreAfterSeek: config.score_after_seek ?? DEFAULTS.score_after_seek,
    masterVolume: config.master_volume ?? DEFAULTS.master_volume,
    ...replayGainSettings(config),
    lyricsVertical: config.lyrics_vertical_position ?? DEFAULTS.lyrics_vertical_position,
    lyricsHorizontal: config.lyrics_horizontal_position ?? DEFAULTS.lyrics_horizontal_position,
    lyricsScale: clampPlaybackScale(config.lyrics_scale),
    pitchGraphScale: clampPitchGraphScale(config.pitch_graph_scale),
    lyricsRomanizationMode: config.lyrics_romanization_mode ?? DEFAULTS.lyrics_romanization_mode,
    showLyrics: config.show_lyrics ?? DEFAULTS.show_lyrics,
    showPitchGraph: config.show_pitch_graph ?? DEFAULTS.show_pitch_graph,
  };
};

function panelRangeSettings(config: AppConfig | undefined) {
  return {
    playback_progress_scale: clampPlaybackPanelScale(config?.playback_progress_scale),
    playback_status_scale: clampPlaybackPanelScale(config?.playback_status_scale),
    playback_controls_scale: clampPlaybackPanelScale(config?.playback_controls_scale),
  };
}
function interfaceSettings(config: AppConfig | undefined) {
  return {
    config: config ?? null,
    fontSize: interfaceFontSize(config?.app_font_size),
    horizontal: config?.pitch_graph_horizontal_position,
    vertical: config?.pitch_graph_vertical_position,
  };
}
function playbackRangeSettings(config: AppConfig | undefined): PlaybackRangeValues {
  return {
    ...panelRangeSettings(config),
    intro_skip_lead_sec: Math.min(10, Math.max(0, config?.intro_skip_lead_sec ?? 3)),
    queue_auto_advance_delay_sec: Math.min(
      60,
      Math.max(1, config?.queue_auto_advance_delay_sec ?? 5),
    ),
    lyrics_offset_x: clampPlaybackOffset(config?.lyrics_offset_x),
    lyrics_offset_y: clampPlaybackOffset(config?.lyrics_offset_y),
    pitch_graph_offset_x: clampPlaybackOffset(config?.pitch_graph_offset_x),
    pitch_graph_offset_y: clampPlaybackOffset(config?.pitch_graph_offset_y),
    pitch_graph_window_sec: clampPitchGraphWindow(config?.pitch_graph_window_sec),
  };
}

const pendingValue = <T,>(input: T | null, saved: T): T => input ?? saved;
const autoAdvanceEnabled = (config: AppConfig | undefined): boolean =>
  config?.queue_auto_advance ?? DEFAULTS.queue_auto_advance;

const analysisSettings = (config: AppConfig | undefined) => {
  if (!config) {
    return {
      asrEngine: DEFAULTS.asr_engine,
      separator: DEFAULTS.separator,
      whisperModel: DEFAULTS.whisper_model,
      beamSize: DEFAULTS.beam_size,
      alignBackend: DEFAULTS.align_backend,
      autoAnalyze: DEFAULTS.auto_analyze,
      batchSize: DEFAULTS.batch_size,
      vocalThreshold: DEFAULTS.vocal_detection_threshold_pct,
      mvDirectory: DEFAULTS.mv_directory,
    };
  }

  return {
    asrEngine: config.asr_engine ?? DEFAULTS.asr_engine,
    separator: config.separator ?? DEFAULTS.separator,
    whisperModel: config.whisper_model ?? DEFAULTS.whisper_model,
    beamSize: config.beam_size ?? DEFAULTS.beam_size,
    alignBackend: config.align_backend ?? DEFAULTS.align_backend,
    autoAnalyze: config.auto_analyze === true,
    batchSize: config.batch_size ?? DEFAULTS.batch_size,
    vocalThreshold: config.vocal_detection_threshold_pct ?? DEFAULTS.vocal_detection_threshold_pct,
    mvDirectory: config.mv_directory,
  };
};

const isSettingsTab = (value: string): value is SettingsTab =>
  SETTINGS_TABS.some((tab) => tab.value === value);

function SeekScoringSetting({
  enabled,
  onChange,
  getFocusClassName,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  getFocusClassName: (segment: number, slot?: number) => string;
}) {
  const { t } = useI18n();
  return (
    <Field>
      <Label>{t('Count scores after seeking')}</Label>
      <Hint>
        {t(
          'When enabled, dragging the progress bar or using the seek buttons still records scores. Pause and resume do not affect scoring. Applies to the current song until it finishes.',
        )}
      </Hint>
      <ButtonGroup aria-label={t('Count scores after seeking')}>
        <Button
          variant={enabled ? 'outline' : 'default'}
          aria-pressed={!enabled}
          onClick={() => onChange(false)}
          className={getFocusClassName(NAV.playback.scoreAfterSeek, 0)}
        >
          {t('Off')}
        </Button>
        <Button
          variant={enabled ? 'default' : 'outline'}
          aria-pressed={enabled}
          onClick={() => onChange(true)}
          className={getFocusClassName(NAV.playback.scoreAfterSeek, 1)}
        >
          {t('On')}
        </Button>
      </ButtonGroup>
    </Field>
  );
}

function VisibilitySetting({
  label,
  hint,
  enabled,
  segment,
  onChange,
  getFocusClassName,
}: {
  label: string;
  hint?: string;
  enabled: boolean;
  segment: number;
  onChange: (enabled: boolean) => void;
  getFocusClassName: (segment: number, slot?: number) => string;
}) {
  const { t } = useI18n();
  return (
    <Field>
      <Label>{label}</Label>
      {hint !== undefined && <Hint>{hint}</Hint>}
      <ButtonGroup aria-label={label}>
        <Button
          variant={enabled ? 'outline' : 'default'}
          aria-pressed={!enabled}
          onClick={() => onChange(false)}
          className={getFocusClassName(segment, 0)}
        >
          {t('Off')}
        </Button>
        <Button
          variant={enabled ? 'default' : 'outline'}
          aria-pressed={enabled}
          onClick={() => onChange(true)}
          className={getFocusClassName(segment, 1)}
        >
          {t('On')}
        </Button>
      </ButtonGroup>
    </Field>
  );
}

function VisibleSettings({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? children : null;
}

function MvDirectorySetting({
  path,
  onChange,
  getFocusClassName,
  segment,
}: {
  path: string | null;
  onChange: (path: string | null) => void;
  getFocusClassName: (segment: number, slot?: number) => string;
  segment: number;
}) {
  const { t } = useI18n();
  const choose = async () => {
    try {
      const selected = isTauri
        ? await open({ directory: true, multiple: false })
        : window.prompt(t('MV folder path visible to the server'), path ?? '/videos');
      if (typeof selected === 'string' && selected.trim() !== '') {
        onChange(selected.trim());
      }
    } catch (error) {
      toast.error(t('Could not select MV folder: {error}', { error: String(error) }));
    }
  };

  return (
    <Field>
      <Label>{t('MV folder for automatic matching')}</Label>
      <Hint>
        {t(
          'During analysis, the video filename without its extension must exactly match the song title or the full "title - artist" form.',
        )}
      </Hint>
      <output className="block break-all text-sm text-muted-foreground">
        {path ?? t('No MV folder selected')}
      </output>
      {path !== null && (
        <Hint>
          {t(
            'Removing this folder does not delete files or existing MV matches. Reanalyze songs to refresh their matches.',
          )}
        </Hint>
      )}
      <ButtonGroup aria-label={t('MV folder for automatic matching')}>
        <Button
          variant="outline"
          onClick={() => void choose()}
          className={getFocusClassName(segment, 0)}
        >
          {t('Choose MV folder')}
        </Button>
        <Button
          variant="outline"
          disabled={path === null}
          onClick={() => onChange(null)}
          className={getFocusClassName(segment, 1)}
        >
          {t('Remove MV matching folder')}
        </Button>
      </ButtonGroup>
    </Field>
  );
}

export const SettingsPage = () => {
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const { mutate } = useConfigMutation();

  const containerRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<SettingsTab>('general');
  const [backgroundDialogOpen, setBackgroundDialogOpen] = useState(false);
  const [hasMultiChannelInput, setHasMultiChannelInput] = useState(false);
  const general = generalSettings(config);
  const ui = interfaceSettings(config);
  const speakers = speakerSettings(config);
  const playback = playbackSettings(config);
  const [showLyricsInput, setShowLyrics] = useState<boolean | null>(null);
  const showLyrics = pendingValue(showLyricsInput, playback.showLyrics);
  const [showPitchGraphInput, setShowPitchGraph] = useState<boolean | null>(null);
  const showPitchGraph = pendingValue(showPitchGraphInput, playback.showPitchGraph);
  const [rangeInput, setRangeInput] = useState<Partial<PlaybackRangeValues>>({});
  const rangeValues = { ...playbackRangeSettings(config), ...rangeInput };
  const analysis = analysisSettings(config);
  const [isFullScreen, setIsFullScreen] = useState<boolean | null | undefined>(general.fullscreen);
  const [micMonitorGainInput, setMicMonitorGain] = useState<number | null>(null);
  const micMonitorGain = micMonitorGainInput ?? general.micMonitorGain;
  const [micLatencySecInput, setMicLatencySec] = useState<number | null>(null);
  const micLatencySec = micLatencySecInput ?? general.micLatency;
  const [masterVolumeInput, setMasterVolume] = useState<number | null>(null);
  const masterVolume = masterVolumeInput ?? playback.masterVolume;
  const [replayGainEnabledInput, setReplayGainEnabled] = useState<boolean | null>(null);
  const replayGainEnabled = pendingValue(replayGainEnabledInput, playback.replayGainEnabled);
  const [replayGainPreampInput, setReplayGainPreamp] = useState<number | null>(null);
  const replayGainPreampDb = pendingValue(replayGainPreampInput, playback.replayGainPreampDb);
  const [lyricsVerticalInput, setLyricsVertical] = useState<string | null>(null);
  const lyricsVertical = pendingValue(lyricsVerticalInput, playback.lyricsVertical);
  const [lyricsHorizontalInput, setLyricsHorizontal] = useState<string | null>(null);
  const lyricsHorizontal = pendingValue(lyricsHorizontalInput, playback.lyricsHorizontal);
  const [lyricsScaleInput, setLyricsScale] = useState<number | null>(null);
  const lyricsScale = pendingValue(lyricsScaleInput, playback.lyricsScale);
  const [pitchGraphScaleInput, setPitchGraphScale] = useState<number | null>(null);
  const pitchGraphScale = pendingValue(pitchGraphScaleInput, playback.pitchGraphScale);
  const [lyricsRomanizationModeInput, setLyricsRomanizationMode] = useState<string | null>(null);
  const lyricsRomanizationMode = pendingValue(
    lyricsRomanizationModeInput,
    playback.lyricsRomanizationMode,
  );
  const [vocalThresholdPctInput, setVocalThresholdPct] = useState<number | null>(null);
  const vocalThresholdPct = vocalThresholdPctInput ?? analysis.vocalThreshold;

  const close = (): void => {
    void navigate('/');
  };
  const asrEngine = analysis.asrEngine;
  const isParakeet = asrEngine === 'parakeet';
  const analysisNav = getAnalysisNav(isParakeet);

  const modelOptions = useMemo(() => MODELS.map((model) => ({ value: model, label: model })), []);
  const masterVolumePct = Math.round(masterVolume * 100);
  const lyricsScalePct = Math.round(lyricsScale * 100);
  const pitchGraphScalePct = Math.round(pitchGraphScale * 100);
  const vocalThresholdDisplayPct = Math.round(vocalThresholdPct * 100);
  const batchSize = analysis.batchSize;
  const beamSize = analysis.beamSize;

  useEffect(() => {
    const updateIsFullScreen = async () => {
      setIsFullScreen(await tauriIsFullScreen());
    };

    void updateIsFullScreen();
  }, []);

  const updateMicMonitorGain = (gain: number) => {
    setMicMonitorGain(gain);
    mutate({ mic_monitor_gain: gain });
  };

  const updateMicLatency = (latencySec: number) => {
    setMicLatencySec(latencySec);
    mutate({ mic_latency_compensation_sec: latencySec });
  };

  const updateMasterVolume = (volume: number) => {
    setMasterVolume(volume);
    mutate({ master_volume: volume });
  };

  const updateReplayGainPreamp = (value: number) => {
    setReplayGainPreamp(value);
    mutate({ replay_gain_preamp_db: value });
  };

  const updateLyricsScale = (scale: number) => {
    setLyricsScale(scale);
    mutate({ lyrics_scale: scale });
  };

  const updatePitchGraphScale = (scale: number) => {
    setPitchGraphScale(scale);
    mutate({ pitch_graph_scale: scale });
  };

  const updateVocalThreshold = (pct: number) => {
    setVocalThresholdPct(pct);
    mutate({ vocal_detection_threshold_pct: pct });
  };

  const updatePlaybackRange = (key: PlaybackRangeKey, value: number) => {
    setRangeInput((previous) => ({ ...previous, [key]: value }));
    mutate({ [key]: value });
  };

  const playbackRanges = PLAYBACK_RANGE_KEYS.map((key) => {
    const definition = PLAYBACK_RANGES[key];
    return {
      segment: definition.segment,
      min: definition.min,
      max: definition.max,
      step: definition.step,
      value: rangeValues[key],
      onChange: (value: number) => updatePlaybackRange(key, value),
    };
  });
  playbackRanges.push({
    segment: NAV.playback.replayGainPreamp,
    min: 0,
    max: 10,
    step: 0.5,
    value: replayGainPreampDb,
    onChange: updateReplayGainPreamp,
  });

  const toggleWindowMode = (fullscreen: boolean) => {
    setIsFullScreen(fullscreen);
    void setFullScreen(fullscreen);
    mutate({ fullscreen });
  };

  const resetDefaults = () => {
    mutate(DEFAULTS);
    setMicMonitorGain(DEFAULTS.mic_monitor_gain);
    setMicLatencySec(DEFAULTS.mic_latency_compensation_sec);
    setMasterVolume(DEFAULTS.master_volume);
    setReplayGainEnabled(DEFAULTS.replay_gain_enabled);
    setReplayGainPreamp(DEFAULTS.replay_gain_preamp_db);
    setLyricsVertical(DEFAULTS.lyrics_vertical_position);
    setLyricsHorizontal(DEFAULTS.lyrics_horizontal_position);
    setLyricsScale(DEFAULTS.lyrics_scale);
    setPitchGraphScale(DEFAULTS.pitch_graph_scale);
    setLyricsRomanizationMode(DEFAULTS.lyrics_romanization_mode);
    setShowLyrics(DEFAULTS.show_lyrics);
    setShowPitchGraph(DEFAULTS.show_pitch_graph);
    setVocalThresholdPct(DEFAULTS.vocal_detection_threshold_pct);
    setRangeInput(PLAYBACK_NUMERIC_DEFAULTS);
  };

  const { footerSegment, getFocusClassName, syncFocusFromElement } = useSettingsNavigation({
    containerRef,
    enabled: settingsNavigationEnabled(tab, backgroundDialogOpen),
    tab,
    isParakeet,
    hasMultiChannelInput,
    hasSecondOutput: speakers.hasSecondOutput,
    showLyrics,
    showPitchGraph,
    micMonitorGain,
    appFontSize: ui.fontSize,
    onAppFontSizeChange: (app_font_size) => mutate({ app_font_size }),
    micLatencySec,
    masterVolume,
    lyricsScale,
    pitchGraphScale,
    vocalThresholdPct,
    playbackRanges,
    onBack: close,
    onTabChange: setTab,
    onMicMonitorGainChange: updateMicMonitorGain,
    onMicLatencyChange: updateMicLatency,
    onMasterVolumeChange: updateMasterVolume,
    onLyricsScaleChange: updateLyricsScale,
    onPitchGraphScaleChange: updatePitchGraphScale,
    onVocalThresholdChange: updateVocalThreshold,
  });

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto px-4 pb-5 pt-14 sm:px-6 md:pt-5 lg:px-8"
      onMouseMoveCapture={(event) => syncFocusFromElement(event.target)}
      onFocusCapture={(event) => syncFocusFromElement(event.target)}
    >
      <div className="mx-auto flex max-w-4xl flex-col gap-5">
        <PageHeader />

        <Tabs
          value={tab}
          onValueChange={(value) => {
            if (isSettingsTab(value)) {
              setTab(value);
            }
          }}
        >
          <TabsList className="scrollbar-hide max-w-full overflow-x-auto overflow-y-hidden sm:w-fit">
            {SETTINGS_TABS.map((settingsTab, slot) => (
              <TabsTrigger
                key={settingsTab.value}
                value={settingsTab.value}
                className={getFocusClassName(NAV.tabSegment, slot)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    setTab(settingsTab.value);
                  }
                }}
              >
                {t(settingsTab.label)}
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="general" className="mt-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="interface-language">{t('Interface language')}</Label>
                <Hint>
                  {t(
                    'Choose the language used by menus and controls. Songs and lyrics are not translated.',
                  )}
                </Hint>
                <SettingsSelect
                  id="interface-language"
                  label={t('Interface language')}
                  placeholder={t('Interface language')}
                  value={language}
                  options={[
                    { value: 'en', label: 'English', translateLabel: false },
                    { value: 'zh-CN', label: '简体中文', translateLabel: false },
                  ]}
                  triggerClassName={getFocusClassName(NAV.general.language)}
                  onValueChange={(value) => {
                    if (value === 'en' || value === 'zh-CN') {
                      mutate({ ui_language: value });
                    }
                  }}
                />
              </Field>
              <Field>
                <Label>{t('Window')}</Label>
                <ButtonGroup>
                  <Button
                    variant={isFullScreen === true ? 'outline' : 'default'}
                    onClick={() => toggleWindowMode(false)}
                    className={getFocusClassName(NAV.general.window, 0)}
                  >
                    {t('Windowed')}
                  </Button>
                  <Button
                    variant={isFullScreen === false ? 'outline' : 'default'}
                    onClick={() => toggleWindowMode(true)}
                    className={getFocusClassName(NAV.general.window, 1)}
                  >
                    {t('Fullscreen')}
                  </Button>
                </ButtonGroup>
              </Field>

              <MicrophoneSettings
                savedMicId={general.preferredMic}
                combineMultiChannel={general.combineMultiChannel}
                monitorGain={micMonitorGain}
                latencySec={micLatencySec}
                getFocusClassName={getFocusClassName}
                onMultiChannelAvailabilityChange={setHasMultiChannelInput}
                onMonitorGainChange={updateMicMonitorGain}
                onLatencyChange={updateMicLatency}
              />
              <SpeakerSettings routes={speakers.routes} getFocusClassName={getFocusClassName} />
              <AppFontSetting
                value={ui.fontSize}
                segment={footerSegment - 1}
                getFocusClassName={getFocusClassName}
              />
            </FieldGroup>
          </TabsContent>

          <TabsContent value="playback" className="mt-4">
            <div className="space-y-5">
              <div className="w-[65%]">
                <PlaybackPreview
                  showLyrics={showLyrics}
                  showPitchGraph={showPitchGraph}
                  progressScale={rangeValues.playback_progress_scale}
                  statusScale={rangeValues.playback_status_scale}
                  controlsScale={rangeValues.playback_controls_scale}
                  pitchGraphHorizontalPosition={ui.horizontal}
                  pitchGraphVerticalPosition={ui.vertical}
                  lyricsVerticalPosition={lyricsVertical}
                  lyricsHorizontalPosition={lyricsHorizontal}
                  lyricsScale={lyricsScale}
                  pitchGraphScale={pitchGraphScale}
                  lyricsOffsetX={rangeValues.lyrics_offset_x}
                  lyricsOffsetY={rangeValues.lyrics_offset_y}
                  pitchGraphOffsetX={rangeValues.pitch_graph_offset_x}
                  pitchGraphOffsetY={rangeValues.pitch_graph_offset_y}
                  pitchWindowSeconds={rangeValues.pitch_graph_window_sec}
                />
              </div>

              <FieldGroup>
                <BackgroundSettings
                  selectClassName={getFocusClassName(NAV.playback.background, 0)}
                  manageClassName={getFocusClassName(NAV.playback.background, 1)}
                  onDialogOpenChange={setBackgroundDialogOpen}
                />

                <Field>
                  <Label htmlFor="playback-mode-1">{t('Playback mode')}</Label>
                  <Hint>{t('Choose whether playback replaces the menu or runs beside it')}</Hint>
                  <SettingsSelect
                    id="playback-mode-1"
                    label={t('Playback mode')}
                    placeholder={t('Select playback mode')}
                    value={playback.mode}
                    options={PLAYBACK_MODES}
                    triggerClassName={getFocusClassName(NAV.playback.mode)}
                    onValueChange={(playback_mode) => mutate({ playback_mode })}
                  />
                </Field>

                <SeekScoringSetting
                  enabled={playback.scoreAfterSeek}
                  onChange={(score_after_seek) => mutate({ score_after_seek })}
                  getFocusClassName={getFocusClassName}
                />

                <AutoAdvanceSetting
                  enabled={autoAdvanceEnabled(config)}
                  onChange={(queue_auto_advance) => mutate({ queue_auto_advance })}
                  getFocusClassName={getFocusClassName}
                />
                <PlaybackRangeSetting
                  {...PLAYBACK_RANGES.intro_skip_lead_sec}
                  value={rangeValues.intro_skip_lead_sec}
                  onChange={(value) => updatePlaybackRange('intro_skip_lead_sec', value)}
                  getFocusClassName={getFocusClassName}
                />
                <PlaybackRangeSetting
                  {...PLAYBACK_RANGES.queue_auto_advance_delay_sec}
                  value={rangeValues.queue_auto_advance_delay_sec}
                  onChange={(value) => updatePlaybackRange('queue_auto_advance_delay_sec', value)}
                  getFocusClassName={getFocusClassName}
                />

                <Field>
                  <Label>{t('Master volume')}</Label>
                  <Hint>
                    {t('Overall playback volume ({percent}%)', { percent: masterVolumePct })}
                  </Hint>
                  <Slider
                    min={0}
                    max={100}
                    step={1}
                    value={[masterVolumePct]}
                    onValueChange={([pct]) => updateMasterVolume(pct / 100)}
                    className={getFocusClassName(NAV.playback.masterVolume)}
                  />
                </Field>

                <VisibilitySetting
                  label={t('Enable ReplayGain')}
                  hint={t(
                    'Use track gain, or album gain if track gain is missing. Songs without valid tags keep their original volume.',
                  )}
                  enabled={replayGainEnabled}
                  segment={NAV.playback.replayGainEnabled}
                  onChange={(replay_gain_enabled) => {
                    setReplayGainEnabled(replay_gain_enabled);
                    mutate({ replay_gain_enabled });
                  }}
                  getFocusClassName={getFocusClassName}
                />

                <Field data-nav-passthrough>
                  <Label>{t('ReplayGain preamp')}</Label>
                  <Hint>
                    {t(
                      'Extra gain for tagged songs: {value} dB. A peak tag may limit amplification to avoid clipping.',
                      { value: replayGainPreampDb.toFixed(1) },
                    )}
                  </Hint>
                  <Slider
                    min={0}
                    max={10}
                    step={0.5}
                    value={[replayGainPreampDb]}
                    aria-label={t('ReplayGain preamp')}
                    aria-valuetext={`${replayGainPreampDb.toFixed(1)} dB`}
                    onValueChange={([value]) => updateReplayGainPreamp(value)}
                    className={getFocusClassName(NAV.playback.replayGainPreamp)}
                  />
                </Field>

                <VisibilitySetting
                  label={t('Show lyrics during playback')}
                  enabled={showLyrics}
                  segment={NAV.playback.showLyrics}
                  onChange={(show_lyrics) => {
                    setShowLyrics(show_lyrics);
                    mutate({ show_lyrics });
                  }}
                  getFocusClassName={getFocusClassName}
                />

                <VisibleSettings when={showLyrics}>
                  <Field>
                    <Label htmlFor="lyrics-vertical-position-1">
                      {t('Lyrics vertical position')}
                    </Label>
                    <Hint>{t('Top moves playback HUD and pitch graph to the bottom')}</Hint>
                    <SettingsSelect
                      id="lyrics-vertical-position-1"
                      label={t('Lyrics vertical position')}
                      placeholder={t('Select vertical position')}
                      value={lyricsVertical}
                      options={LYRICS_VERTICAL_POSITIONS}
                      triggerClassName={getFocusClassName(NAV.playback.lyricsVerticalPosition)}
                      onValueChange={(lyrics_vertical_position) => {
                        setLyricsVertical(lyrics_vertical_position);
                        mutate({ lyrics_vertical_position });
                      }}
                    />
                  </Field>

                  <Field>
                    <Label htmlFor="lyrics-horizontal-position-1">
                      {t('Lyrics horizontal position')}
                    </Label>
                    <Hint>{t('Align lyrics left, center, or right during playback')}</Hint>
                    <SettingsSelect
                      id="lyrics-horizontal-position-1"
                      label={t('Lyrics horizontal position')}
                      placeholder={t('Select horizontal position')}
                      value={lyricsHorizontal}
                      options={LYRICS_HORIZONTAL_POSITIONS}
                      triggerClassName={getFocusClassName(NAV.playback.lyricsHorizontalPosition)}
                      onValueChange={(lyrics_horizontal_position) => {
                        setLyricsHorizontal(lyrics_horizontal_position);
                        mutate({ lyrics_horizontal_position });
                      }}
                    />
                  </Field>

                  <PlaybackRangeSetting
                    {...PLAYBACK_RANGES.lyrics_offset_x}
                    value={rangeValues.lyrics_offset_x}
                    onChange={(value) => updatePlaybackRange('lyrics_offset_x', value)}
                    getFocusClassName={getFocusClassName}
                  />
                  <PlaybackRangeSetting
                    {...PLAYBACK_RANGES.lyrics_offset_y}
                    value={rangeValues.lyrics_offset_y}
                    onChange={(value) => updatePlaybackRange('lyrics_offset_y', value)}
                    getFocusClassName={getFocusClassName}
                  />

                  <Field>
                    <Label>{t('Lyrics scale')}</Label>
                    <Hint>
                      {t('Size of lyrics during playback ({percent}%)', {
                        percent: lyricsScalePct,
                      })}
                    </Hint>
                    <Slider
                      min={PLAYBACK_SCALE_MIN * 100}
                      max={PLAYBACK_SCALE_MAX * 100}
                      step={PLAYBACK_SCALE_STEP * 100}
                      value={[lyricsScalePct]}
                      onValueChange={([pct]) => updateLyricsScale(pct / 100)}
                      className={getFocusClassName(NAV.playback.lyricsScale)}
                    />
                  </Field>

                  <Field>
                    <Label>{t('Romanize lyrics')}</Label>
                    <Hint>{t('Whether to show romanized lyrics for songs in CJK languages')}</Hint>
                    <SettingsButtonGroup
                      value={lyricsRomanizationMode}
                      options={LYRICS_ROMANIZATION_MODES}
                      segment={NAV.playback.lyricsRomanizationMode}
                      getFocusClassName={getFocusClassName}
                      onChange={(lyrics_romanization_mode) => {
                        setLyricsRomanizationMode(lyrics_romanization_mode);
                        mutate({ lyrics_romanization_mode });
                      }}
                    />
                  </Field>
                </VisibleSettings>

                <VisibilitySetting
                  label={t('Show pitch graph during playback')}
                  enabled={showPitchGraph}
                  segment={NAV.playback.showPitchGraph}
                  onChange={(show_pitch_graph) => {
                    setShowPitchGraph(show_pitch_graph);
                    mutate({ show_pitch_graph });
                  }}
                  getFocusClassName={getFocusClassName}
                />

                <VisibleSettings when={showPitchGraph}>
                  <PitchAnchorSettings config={config} getFocusClassName={getFocusClassName} />

                  <PlaybackRangeSetting
                    {...PLAYBACK_RANGES.pitch_graph_offset_x}
                    value={rangeValues.pitch_graph_offset_x}
                    onChange={(value) => updatePlaybackRange('pitch_graph_offset_x', value)}
                    getFocusClassName={getFocusClassName}
                  />
                  <PlaybackRangeSetting
                    {...PLAYBACK_RANGES.pitch_graph_offset_y}
                    value={rangeValues.pitch_graph_offset_y}
                    onChange={(value) => updatePlaybackRange('pitch_graph_offset_y', value)}
                    getFocusClassName={getFocusClassName}
                  />

                  <Field>
                    <Label>{t('Pitch graph scale')}</Label>
                    <Hint>
                      {t('Size of pitch graph during playback ({percent}%)', {
                        percent: pitchGraphScalePct,
                      })}
                    </Hint>
                    <Slider
                      min={PLAYBACK_SCALE_MIN * 100}
                      max={PITCH_GRAPH_SCALE_MAX * 100}
                      step={PLAYBACK_SCALE_STEP * 100}
                      value={[pitchGraphScalePct]}
                      onValueChange={([pct]) => updatePitchGraphScale(pct / 100)}
                      className={getFocusClassName(NAV.playback.pitchGraphScale)}
                    />
                  </Field>

                  <PlaybackRangeSetting
                    {...PLAYBACK_RANGES.pitch_graph_window_sec}
                    value={rangeValues.pitch_graph_window_sec}
                    onChange={(value) => updatePlaybackRange('pitch_graph_window_sec', value)}
                    getFocusClassName={getFocusClassName}
                  />
                </VisibleSettings>
                {(
                  [
                    'playback_progress_scale',
                    'playback_status_scale',
                    'playback_controls_scale',
                  ] as const
                ).map((key) => (
                  <PlaybackRangeSetting
                    key={key}
                    {...PLAYBACK_RANGES[key]}
                    value={rangeValues[key]}
                    onChange={(value) => updatePlaybackRange(key, value)}
                    getFocusClassName={getFocusClassName}
                  />
                ))}
              </FieldGroup>
            </div>
          </TabsContent>

          <TabsContent value="shortcuts" className="mt-4">
            <ShortcutSettings config={ui.config} />
          </TabsContent>
          <TabsContent value="analysis" className="mt-4">
            <FieldGroup>
              <Field>
                <Label htmlFor="separator-1">{t('Vocal separator')}</Label>
                <Hint>{t('How vocals are split from the music.')}</Hint>
                <SettingsSelect
                  id="separator-1"
                  label={t('Separator')}
                  placeholder={t('Select a separator')}
                  value={analysis.separator}
                  options={SEPARATORS}
                  triggerClassName={getFocusClassName(analysisNav.separator)}
                  onValueChange={(separator) => mutate({ separator })}
                />
              </Field>

              <Field>
                <Label htmlFor="asr-engine-1">{t('Transcription model')}</Label>
                <Hint>{t('Turns the vocals into lyrics.')}</Hint>
                <SettingsSelect
                  id="asr-engine-1"
                  label={t('ASR Engine')}
                  placeholder={t('Select an engine')}
                  value={asrEngine}
                  options={ASR_ENGINES}
                  triggerClassName={getFocusClassName(analysisNav.asrEngine)}
                  onValueChange={(asr_engine) => mutate({ asr_engine })}
                />
              </Field>

              {!isParakeet && (
                <>
                  <Field>
                    <Label htmlFor="model-1">{t('Model size')}</Label>
                    <Hint>{t('Smaller models are faster but produce worse results')}</Hint>
                    <SettingsSelect
                      id="model-1"
                      label={t('Model size')}
                      placeholder={t('Select a model size')}
                      value={analysis.whisperModel}
                      options={modelOptions}
                      triggerClassName={getFocusClassName(analysisNav.whisperModel)}
                      onValueChange={(whisper_model) => mutate({ whisper_model })}
                    />
                  </Field>

                  <Field>
                    <Label>{t('Beam Size')}</Label>
                    <Hint>{t('Higher values improve accuracy at the cost of speed')}</Hint>
                    <NumberButtonGroup
                      name="beam_size"
                      value={beamSize}
                      segment={analysisNav.beamSize}
                      getFocusClassName={getFocusClassName}
                      onChange={(beam_size) => mutate({ beam_size })}
                    />
                  </Field>
                </>
              )}

              <Field>
                <Label htmlFor="align-backend-1">{t('Alignment model')}</Label>
                <Hint>{t('How each word is timed to the audio.')}</Hint>
                <SettingsSelect
                  id="align-backend-1"
                  label={t('Forced alignment')}
                  placeholder={t('Select an alignment backend')}
                  value={analysis.alignBackend}
                  options={ALIGN_BACKENDS}
                  triggerClassName={getFocusClassName(analysisNav.alignBackend)}
                  onValueChange={(align_backend) => mutate({ align_backend })}
                />
              </Field>

              <Field>
                <Label>{t('Auto-analyze')}</Label>
                <Hint>
                  {t(
                    'Enabling queues existing unanalyzed songs immediately; later scans queue newly found unanalyzed songs.',
                  )}
                </Hint>
                <ButtonGroup>
                  <Button
                    variant={analysis.autoAnalyze ? 'outline' : 'default'}
                    onClick={() => mutate({ auto_analyze: false })}
                    className={getFocusClassName(analysisNav.autoAnalyze, 0)}
                  >
                    {t('Off')}
                  </Button>
                  <Button
                    variant={analysis.autoAnalyze ? 'default' : 'outline'}
                    onClick={() => mutate({ auto_analyze: true })}
                    className={getFocusClassName(analysisNav.autoAnalyze, 1)}
                  >
                    {t('On')}
                  </Button>
                </ButtonGroup>
              </Field>

              <Field>
                <Label>{t('Vocal detection threshold')}</Label>
                <Hint>
                  {t(
                    "How loud the vocals must be to count as the song's start and end. Lower it if quiet intros, outros, or soft singing get cut off; raise it to trim more silence ({percent}% of the loudest moment)",
                    { percent: vocalThresholdDisplayPct },
                  )}
                </Hint>
                <Slider
                  min={0}
                  max={Math.round(VOCAL_THRESHOLD_MAX * 100)}
                  step={1}
                  value={[vocalThresholdDisplayPct]}
                  onValueChange={([pct]) => updateVocalThreshold(pct / 100)}
                  className={getFocusClassName(analysisNav.vocalThreshold)}
                />
              </Field>

              <Field>
                <Label>{t('Batch Size')}</Label>
                <Hint>{t('Higher values use more memory but process faster')}</Hint>
                <NumberButtonGroup
                  name="batch_size"
                  value={batchSize}
                  segment={analysisNav.batchSize}
                  getFocusClassName={getFocusClassName}
                  onChange={(batch_size) => mutate({ batch_size })}
                />
              </Field>

              <MvDirectorySetting
                path={analysis.mvDirectory}
                onChange={(mv_directory) => mutate({ mv_directory })}
                getFocusClassName={getFocusClassName}
                segment={analysisNav.mvDirectory}
              />
            </FieldGroup>
          </TabsContent>
        </Tabs>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button
            variant="ghost"
            onClick={resetDefaults}
            className={getFocusClassName(footerSegment, 0)}
          >
            {t('Restore Defaults')}
          </Button>
          <Button variant="outline" onClick={close} className={getFocusClassName(footerSegment, 1)}>
            {t('Close')}
          </Button>
        </div>
      </div>
    </div>
  );
};

function settingsNavigationEnabled(tab: SettingsTab, backgroundDialogOpen: boolean): boolean {
  return !backgroundDialogOpen && tab !== 'shortcuts';
}
