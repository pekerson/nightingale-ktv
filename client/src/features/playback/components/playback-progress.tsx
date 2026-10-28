import { useEffect, useId, useRef, useState } from 'react';

import { LiveKeyControls } from '@/features/playback/components/live-key-controls';
import { PlaybackMixer } from '@/features/playback/components/playback-mixer';
import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
  usePlaybackTranscriptActions,
  usePlaybackTranscriptState,
} from '@/features/playback/providers';
import { introSkipHint } from '@/features/playback/utils/intro-skip-hint';
import { Button } from '@/shared/components/ui/button';
import { Slider } from '@/shared/components/ui/slider';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';
import { shortcutLabel, type ShortcutBindings } from '@/shared/shortcuts/shortcuts';
import { cn } from '@/shared/utils/cn';

function formatTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${(wholeSeconds % 60).toString().padStart(2, '0')}`;
}

function transportShortcut(offset: number, bindings: ShortcutBindings): string {
  if (offset === 0) {
    return shortcutLabel('pause', bindings);
  }
  if (Math.abs(offset) === 5) {
    return shortcutLabel(offset < 0 ? 'seek_backward' : 'seek_forward', bindings);
  }
  return '';
}

type PlaybackProgressProps = {
  className?: string;
};

export function PlaybackProgress({ className }: PlaybackProgressProps) {
  const { t } = useI18n();
  const { data: config } = useConfig();
  const {
    duration,
    isReady,
    isFinished,
    practice,
    paused,
    hasSeeked,
    scoreAfterSeek,
    isChangingKey,
  } = usePlaybackTransportState();
  const {
    subscribe,
    subscribeSeek,
    getCurrentTime,
    seekFromControl,
    handlePause,
    handleContinue,
    handleRestart,
    handleFinish,
  } = usePlaybackTransportActions();
  const { canSkipIntro, canSkipOutro, handleSkipIntro, handleSkipOutro } =
    usePlaybackTranscriptActions();
  const transcript = usePlaybackTranscriptState();
  const [position, setPosition] = useState(getCurrentTime);
  const editingRef = useRef(false);
  const hintId = useId();
  const maximum = Math.max(0, duration - 0.05);
  const disabled = !isReady || isFinished || maximum <= 0;
  const keepsScore = hasSeeked ? !practice : scoreAfterSeek;

  useEffect(() => {
    const unsubscribe = subscribe((time) => {
      if (!editingRef.current) {
        setPosition((previous) => (Math.floor(previous) === Math.floor(time) ? previous : time));
      }
    });
    const unsubscribeSeek = subscribeSeek((time) => {
      if (!editingRef.current) {
        setPosition(time);
      }
    });
    return () => {
      unsubscribe();
      unsubscribeSeek();
    };
  }, [subscribe, subscribeSeek]);

  const resetInteraction = () => {
    editingRef.current = false;
    setPosition(getCurrentTime());
  };

  return (
    <fieldset
      aria-label={t('Playback progress')}
      data-nav-passthrough
      className={cn('min-w-0 rounded-md px-1 py-1', className)}
      onPointerUp={resetInteraction}
      onPointerCancel={resetInteraction}
    >
      <div className="flex items-center justify-between gap-2 text-[0.6875rem] tabular-nums">
        <span>
          {formatTime(position)} / {formatTime(duration)}
        </span>
        <output className="text-amber-400">
          {hasSeeked && t(practice ? 'Practice · not scored' : 'Seeking · scores enabled')}
        </output>
      </div>
      <LiveKeyControls />
      <Slider
        aria-label={t('Playback progress')}
        aria-valuetext={`${formatTime(position)} / ${formatTime(duration)}`}
        aria-describedby={hintId}
        className="h-9 [&_[data-slot=slider-track]]:bg-white/25 [&_[data-slot=slider-range]]:bg-white/80 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-white"
        min={0}
        max={maximum}
        step={0.1}
        value={[Math.min(maximum, Math.max(0, position))]}
        disabled={disabled}
        onPointerDown={() => {
          editingRef.current = true;
        }}
        onValueChange={([value]) => {
          setPosition(value);
        }}
        onValueCommit={([value]) => {
          editingRef.current = false;
          seekFromControl(value);
          setPosition(getCurrentTime());
        }}
      />
      <div
        className="mb-2 grid grid-cols-[1fr_1fr_1.4fr_1fr_1fr] gap-1"
        aria-label={t('Playback controls')}
      >
        {[-20, -5, 0, 5, 20].map((offset) => (
          <Button
            key={offset}
            type="button"
            size="sm"
            variant="outline"
            className={cn(
              'h-auto min-h-9 min-w-0 border-white/30 bg-black/10 px-0.5 py-1 text-[0.625rem] leading-tight whitespace-normal break-all text-inherit hover:bg-white/15 hover:text-inherit',
            )}
            disabled={disabled}
            aria-label={
              offset === 0
                ? t(paused ? 'Continue' : 'Pause')
                : t('Seek {seconds} seconds', { seconds: offset })
            }
            title={transportShortcut(offset, config?.shortcut_bindings)}
            onClick={() => {
              if (offset === 0) {
                if (paused) {
                  handleContinue();
                } else {
                  handlePause();
                }
              } else {
                seekFromControl(getCurrentTime() + offset);
              }
            }}
          >
            {offset === 0
              ? t(paused ? 'Continue' : 'Pause')
              : t('{seconds}s', { seconds: offset > 0 ? `+${offset}` : offset })}
          </Button>
        ))}
      </div>
      <div className="mb-2 grid grid-cols-4 gap-1 [&_button]:whitespace-normal [&_button]:leading-tight [&_button]:break-all">
        <Button
          type="button"
          variant="outline"
          className={cn(
            'h-auto min-h-8 min-w-0 border-white/30 bg-black/10 px-0.5 text-[0.625rem] text-inherit hover:bg-white/15 hover:text-inherit',
          )}
          disabled={disabled || isChangingKey}
          title={t('Start this song again with a fresh score.')}
          onClick={handleRestart}
        >
          {t('Sing again')}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0 border-white/30 bg-black/10 h-auto min-h-8 px-0.5 py-1 text-[0.625rem] text-inherit"
          disabled={disabled || !canSkipIntro(position)}
          title={introSkipHint(transcript, position, t)}
          onClick={handleSkipIntro}
        >
          {t('Skip Intro')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0 border-white/30 bg-black/10 h-auto min-h-8 px-0.5 py-1 text-[0.625rem] text-inherit"
          disabled={disabled || !canSkipOutro(position)}
          onClick={handleSkipOutro}
        >
          {t('Skip Outro')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-w-0 border-white/30 bg-black/10 h-auto min-h-8 px-0.5 py-1 text-[0.625rem] text-inherit"
          disabled={disabled}
          title={t('Finish this song and show the score')}
          onClick={handleFinish}
        >
          {t('Next song')}
        </Button>
      </div>
      <p id={hintId} className="text-[0.6875rem] opacity-70">
        {t(
          keepsScore
            ? 'Scores will still be saved after changing position.'
            : 'Changing position makes this song practice only. Scores will not be saved.',
        )}
      </p>
      <PlaybackMixer />
    </fieldset>
  );
}
