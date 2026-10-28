import { memo, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { PlaybackProgress } from '@/features/playback/components/playback-progress';
import { usePlaybackConfigPersist } from '@/features/playback/hooks/use-playback-config-persist';
import { clampPlaybackPanelScale } from '@/features/playback/lib/display-scale';
import type { VideoFlavor } from '@/features/playback/lib/video-flavor';
import {
  usePlaybackMicActions,
  usePlaybackMicState,
  type PlaybackPlayerMicState,
  usePlaybackThemeActions,
  usePlaybackThemeState,
  usePlaybackTranscriptState,
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import { computeLyricGapCaption, findCurrentSegment } from '@/features/playback/utils/lyrics-gap';
import type { Translator } from '@/shared/i18n/translate';
import { useI18n } from '@/shared/i18n/use-i18n';
import { playerColorOption } from '@/shared/player-colors';
import { shortcutLabel } from '@/shared/shortcuts/shortcuts';
import type { AppConfig } from '@/types/AppConfig';

import { isPixabayTheme, themeName, type PlaybackTheme } from './theme';

function HintText({ children }: { children: ReactNode }) {
  return (
    <p className="text-white/50" style={{ fontSize: '0.875em' }}>
      {children}
    </p>
  );
}

const NOTE_BASE_CLASS = `pointer-events-none absolute z-20 text-[0.6rem] text-white/30`;
const PROGRESS_PANEL_STORAGE_KEY = 'nightingale.playback.progress-panel.expanded';

function initialProgressPanelExpanded(): boolean {
  try {
    return window.localStorage.getItem(PROGRESS_PANEL_STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

function saveProgressPanelExpanded(expanded: boolean): void {
  try {
    window.localStorage.setItem(PROGRESS_PANEL_STORAGE_KEY, String(expanded));
  } catch {
    return;
  }
}

function progressPanelActionLabel(expanded: boolean): string {
  return expanded ? 'Hide progress panel' : 'Show progress panel';
}

function progressPanelContentClass(expanded: boolean, flowClass: string): string | undefined {
  return expanded ? `flex min-w-0 ${flowClass}` : undefined;
}

function TouchButton({
  label,
  onClick,
  disabled = false,
  title,
}: {
  title?: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className="pointer-events-auto min-w-0 max-w-full rounded-sm border-2 border-white/70 bg-black/10 px-[0.5em] py-1 text-sm [overflow-wrap:anywhere] text-white/90 transition-colors hover:bg-black/20 active:bg-black/30 disabled:opacity-35"
    >
      {label}
    </button>
  );
}

const displayMicName = (name: string, t: Translator): string =>
  name === 'Default' ? t('Default') : name;

function SettingsInfo({
  guideVolume,
  guideAvailable,
  micUserEnabled,
  micName,
  micMonitorUserEnabled,
  multiplayer,
  theme,
  videoFlavor,
}: {
  guideVolume: number;
  guideAvailable: boolean;
  micUserEnabled: boolean;
  micName: string;
  micMonitorUserEnabled: boolean;
  multiplayer: boolean;
  theme: PlaybackTheme;
  videoFlavor: VideoFlavor;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-end">
      {guideAvailable && (
        <HintText>{t('Vocals: {percent}%', { percent: Math.round(guideVolume * 100) })}</HintText>
      )}
      {!multiplayer && (
        <HintText>
          {t('Mic:')} {micUserEnabled ? displayMicName(micName, t) : t('OFF')}
        </HintText>
      )}
      <HintText>
        {t('Monitor:')} {t(micMonitorUserEnabled ? 'ON' : 'OFF')}
      </HintText>
      <HintText>{t('Theme: {name}', { name: t(themeName(theme, videoFlavor)) })}</HintText>
    </div>
  );
}

function hudScales(config: AppConfig | null) {
  return {
    progress: clampPlaybackPanelScale(config?.playback_progress_scale),
    status: clampPlaybackPanelScale(config?.playback_status_scale),
    controls: clampPlaybackPanelScale(config?.playback_controls_scale),
    exitShortcut: shortcutLabel('exit_playback', config?.shortcut_bindings),
  };
}

function TouchControls({
  config,
  position,
}: {
  config: AppConfig | null;
  position: PlaybackHudPosition;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const scales = hudScales(config);
  const { guideVolume, guideAvailable } = usePlaybackTransportState();
  const { setGuideVolume, handleOpenExit } = usePlaybackTransportActions();
  const { micUserEnabled, micName, micMonitorUserEnabled, multiplayer } = usePlaybackMicState();
  const { handleToggleMic, handleCycleMic, handleToggleMicMonitor } = usePlaybackMicActions();
  const { theme, videoFlavor } = usePlaybackThemeState();
  const { cycleTheme, cycleFlavor } = usePlaybackThemeActions();
  const persistConfig = usePlaybackConfigPersist(config);

  const setPersistedGuideVolume = useCallback(
    (volume: number) => {
      const next = Math.max(0, Math.min(1, volume));
      setGuideVolume(next);
      persistConfig({ guide_volume: next });
    },
    [persistConfig, setGuideVolume],
  );

  const touchLayoutClass = position === 'bottom' ? 'mb-2 flex-col-reverse' : 'mt-2 flex-col';

  return (
    <div
      data-nav-passthrough
      className={`flex shrink-0 items-end gap-2 ${touchLayoutClass}`}
      style={{
        zoom: scales.controls,
        width: `min(18rem, ${38 / scales.controls}vw)`,
      }}
    >
      <div
        className="sm:hidden"
        style={{
          fontSize: `${scales.status / scales.controls}rem`,
        }}
      >
        <SettingsInfo
          guideVolume={guideVolume}
          guideAvailable={guideAvailable}
          micUserEnabled={micUserEnabled}
          micName={micName}
          micMonitorUserEnabled={micMonitorUserEnabled}
          multiplayer={multiplayer}
          theme={theme}
          videoFlavor={videoFlavor}
        />
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="pointer-events-auto min-w-0 max-w-full rounded-sm border-2 border-white/70 bg-black/10 px-[0.5em] py-1 text-sm [overflow-wrap:anywhere] text-white/90 transition-colors hover:bg-black/20 active:bg-black/30"
      >
        {t(open ? 'Hide controls' : 'Playback controls')}
      </button>

      {open && (
        <div
          className="grid w-full gap-2 text-center"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 5rem), 1fr))' }}
        >
          <TouchButton
            label={t('Exit Playback')}
            title={scales.exitShortcut}
            onClick={handleOpenExit}
          />
          {guideAvailable && (
            <>
              <TouchButton
                label={t(guideVolume === 0 ? 'Vocals On' : 'Vocals Off')}
                onClick={() => setPersistedGuideVolume(guideVolume > 0 ? 0 : 1)}
              />
              <TouchButton
                label={t('Vocals +')}
                onClick={() => setPersistedGuideVolume(guideVolume + 0.1)}
              />
              <TouchButton
                label={t('Vocals -')}
                onClick={() => setPersistedGuideVolume(guideVolume - 0.1)}
              />
            </>
          )}
          {!multiplayer && (
            <>
              <TouchButton
                label={t(micUserEnabled ? 'Mic Off' : 'Mic On')}
                onClick={handleToggleMic}
              />
              <TouchButton label={t('Next mic')} onClick={handleCycleMic} />
            </>
          )}
          <TouchButton
            label={t(micMonitorUserEnabled ? 'Monitor Off' : 'Monitor On')}
            onClick={handleToggleMicMonitor}
          />
          <TouchButton label={t('Theme')} onClick={cycleTheme} />
          <TouchButton
            label={t('Flavor')}
            onClick={cycleFlavor}
            disabled={!isPixabayTheme(theme)}
          />
        </div>
      )}
    </div>
  );
}

type PlaybackHudPosition = 'top' | 'bottom';

function Disclaimer({
  source,
  position,
  windowControls,
  noStems,
  micActive,
}: {
  source: string;
  position: PlaybackHudPosition;
  windowControls: boolean;
  noStems: boolean;
  micActive: boolean;
}) {
  const { t } = useI18n();
  // No stems means we score against the original mix, so pitch scoring suffers.
  if (noStems && micActive) {
    return (
      <DisclaimerNote position={position} windowControls={windowControls}>
        {t('Original mix is used, so pitch scoring will likely be inaccurate')}
      </DisclaimerNote>
    );
  }

  // USDX and provided LRC timings are authored, not AI-generated.
  if (source === 'usdx' || source === 'lrc') {
    return null;
  }

  const text =
    source === 'lyrics'
      ? 'Timing is AI-generated and may not be perfectly accurate'
      : 'Lyrics and timing are AI-generated and may not be perfectly accurate';

  return (
    <DisclaimerNote position={position} windowControls={windowControls}>
      {t(text)}
    </DisclaimerNote>
  );
}

function DisclaimerNote({
  position,
  windowControls,
  children,
}: {
  position: PlaybackHudPosition;
  windowControls: boolean;
  children: ReactNode;
}) {
  return (
    <p
      className={`${NOTE_BASE_CLASS} ${notePositionClass(position, windowControls)} left-1/2 -translate-x-1/2 whitespace-nowrap text-center`}
    >
      {children}
    </p>
  );
}

function notePositionClass(hudPosition: PlaybackHudPosition, windowControls = false): string {
  if (hudPosition === 'bottom') {
    return windowControls ? 'top-12' : 'top-2';
  }
  return 'bottom-2';
}

function hudPositionClass(position: PlaybackHudPosition, windowControls: boolean): string {
  if (position === 'bottom') {
    return 'bottom-[calc(2rem+env(safe-area-inset-bottom))] items-end md:bottom-3';
  }
  return windowControls ? 'top-14 items-start' : 'top-[4.25rem] items-start md:top-3';
}

function creditPositionClass(position: PlaybackHudPosition, windowControls: boolean): string {
  return windowControls && position === 'bottom' ? 'top-12' : notePositionClass(position);
}

const scoreTextClass = (score: number | null): string =>
  `text-[1.125em] ${score !== null && score !== 0 ? 'text-white' : 'text-white/50'}`;

function MultiplayerScores({ players }: { players: PlaybackPlayerMicState[] }) {
  const { t } = useI18n();
  return (
    <div className="grid justify-items-end gap-0.5" aria-label={t('Player scores')}>
      {players.map((player, index) => (
        <div
          key={player.id}
          className={`flex items-center justify-end gap-2 ${scoreTextClass(player.pitchScore)}`}
        >
          <span className="whitespace-nowrap">
            {player.profile ?? t('Guest {number}', { number: index + 1 })}:{' '}
            {player.pitchScore ?? '--'}
          </span>
          <span
            className={`size-2 rounded-full ${playerColorOption(player.color).className}`}
            aria-hidden="true"
          />
          <span className="sr-only">
            {t(player.micReady ? 'Microphone ready' : 'Microphone unavailable')}
          </span>
        </div>
      ))}
    </div>
  );
}

type PlaybackHudProps = {
  title: string;
  artist: string;
  config: AppConfig | null;
  position?: PlaybackHudPosition;
  windowControls?: boolean;
};

function PlaybackHudImpl({
  title,
  artist,
  config,
  position = 'top',
  windowControls = false,
}: PlaybackHudProps) {
  const { t } = useI18n();
  const { practice, guideVolume, guideAvailable } = usePlaybackTransportState();
  const { subscribe, getCurrentTime } = usePlaybackTransportActions();
  const { theme, videoFlavor } = usePlaybackThemeState();
  const { segments, transcriptSource } = usePlaybackTranscriptState();
  const { pitchScore, micUserEnabled, micName, micMonitorUserEnabled, multiplayer, players } =
    usePlaybackMicState();
  const [progressExpanded, setProgressExpanded] = useState(initialProgressPanelExpanded);

  const gapCaptionRef = useRef<HTMLOutputElement>(null);
  const gapHintRef = useRef(0);

  const showPixabayCredit = isPixabayTheme(theme);

  // Update playback text without triggering React renders every frame.
  useEffect(() => {
    const updateGapCaption = (time: number) => {
      const el = gapCaptionRef.current;
      if (!el) {
        return;
      }
      if (segments.length === 0) {
        el.style.display = 'none';
        return;
      }
      const idx = findCurrentSegment(segments, time, gapHintRef.current);
      gapHintRef.current = idx;
      const caption = computeLyricGapCaption(segments, time, idx);
      if (typeof caption === 'string' && caption !== '') {
        el.textContent = t('Next lyrics in {seconds}s', {
          seconds: Math.ceil(segments[idx].start - time),
        });
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    };

    gapHintRef.current = 0;
    updateGapCaption(getCurrentTime());

    return subscribe((time) => {
      updateGapCaption(time);
    });
  }, [subscribe, getCurrentTime, segments, t]);

  const scales = hudScales(config);
  const hudPosition = hudPositionClass(position, windowControls);
  const hudFlowClass = position === 'bottom' ? 'flex-col-reverse' : 'flex-col';

  return (
    <>
      <div
        className={`pointer-events-auto absolute inset-x-0 z-20 flex justify-between gap-3 px-3 md:px-4 ${hudPosition}`}
      >
        <div
          className="flex w-72 min-w-0 flex-col sm:w-80"
          style={{
            zoom: scales.progress,
            maxWidth: `${48 / scales.progress}vw`,
            maxHeight: `${85 / scales.progress}vh`,
            overflowY: 'auto',
          }}
        >
          <h1 className="line-clamp-2 [overflow-wrap:anywhere] text-base leading-tight text-white md:text-[1.375rem]">
            {title}
          </h1>
          <p className="line-clamp-1 [overflow-wrap:anywhere] text-sm text-white/70 md:text-base">
            {artist === 'Unknown Artist' ? t('Unknown Artist') : artist}
          </p>
          <button
            type="button"
            data-nav-passthrough
            aria-expanded={progressExpanded}
            aria-controls="playback-progress-panel"
            onClick={() => {
              const next = !progressExpanded;
              setProgressExpanded(next);
              saveProgressPanelExpanded(next);
            }}
            className="self-start rounded-sm border-2 border-white/70 bg-black/40 px-2 py-1 text-xs text-white/90 transition-colors hover:bg-black/60"
          >
            {t(progressPanelActionLabel(progressExpanded))}
          </button>
          <div
            id="playback-progress-panel"
            hidden={!progressExpanded}
            className={progressPanelContentClass(progressExpanded, hudFlowClass)}
          >
            <PlaybackProgress className="text-white" />
            <output
              ref={gapCaptionRef}
              aria-live="polite"
              className="truncate text-xs font-medium text-white/60 md:text-sm"
              style={{ display: 'none' }}
            />
          </div>
        </div>

        <div
          className={`pointer-events-auto flex min-w-0 max-w-[38vw] items-end overflow-y-auto overscroll-contain ${hudFlowClass}`}
          style={{ maxHeight: '85vh' }}
        >
          <div
            className={`flex shrink-0 items-end ${hudFlowClass}`}
            style={{ fontSize: `${scales.status}rem` }}
          >
            {!practice &&
              (multiplayer ? (
                <MultiplayerScores players={players} />
              ) : (
                <div className={scoreTextClass(pitchScore)}>
                  {t('Score:')} {pitchScore ?? '--'}
                </div>
              ))}
            <div className="my-1.5 hidden h-px w-full bg-white/20 sm:block" aria-hidden="true" />
            <div className="hidden sm:block">
              <SettingsInfo
                guideVolume={guideVolume}
                guideAvailable={guideAvailable}
                micUserEnabled={micUserEnabled}
                micName={micName}
                micMonitorUserEnabled={micMonitorUserEnabled}
                multiplayer={multiplayer}
                theme={theme}
                videoFlavor={videoFlavor}
              />
            </div>
          </div>
          <TouchControls config={config} position={position} />
        </div>
      </div>

      {showPixabayCredit && (
        <p
          className={`${NOTE_BASE_CLASS} ${creditPositionClass(position, windowControls)} right-4`}
        >
          {t('Videos by Pixabay')}
        </p>
      )}

      <Disclaimer
        source={transcriptSource}
        position={position}
        windowControls={windowControls}
        noStems={!guideAvailable}
        micActive={micUserEnabled}
      />
    </>
  );
}

export const PlaybackHud = memo(PlaybackHudImpl);
