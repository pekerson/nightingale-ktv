import { useCallback, useState, type ReactNode } from 'react';

import type { PlaybackPlayer } from '@/bridge/playback-session';
/**
 * Playback session: audio engine, visual background, lyrics HUD, and pause overlay.
 * Route shell (`Playback`) keys this session so state resets for every queued entry.
 *
 * `PlaybackInner` itself is the provider shell; `PlaybackLayout` is the
 * presentational tree that consumes the playback contexts via hooks.
 */
import { isTauri } from '@/bridge/runtime';
import { Background } from '@/features/playback/components/background';
import { ResultDialog } from '@/features/playback/components/dialogs/result';
import { LoadingScreen } from '@/features/playback/components/loading-screen';
import { LyricsDisplay } from '@/features/playback/components/lyrics-display';
import { PauseOverlay } from '@/features/playback/components/pause-overlay';
import { PitchGraph } from '@/features/playback/components/pitch-graph';
import { PlaybackHud } from '@/features/playback/components/playback-hud';
import { PlaybackVolumeGate } from '@/features/playback/components/playback-volume-gate';
import { usePlaybackInput, usePlaybackResult } from '@/features/playback/hooks';
import {
  PlaybackProviders,
  usePlaybackMicState,
  usePlaybackTranscriptState,
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { AppConfig } from '@/types/AppConfig';
import type { Song } from '@/types/Song';

export type PlaybackInnerProps = {
  song: Song;
  config: AppConfig | null;
  queuePlayback: boolean;
  sessionPlayback: boolean;
  players?: readonly PlaybackPlayer[];
};

type PlaybackLayoutProps = PlaybackInnerProps;

function VisiblePlaybackGuide({ visible, children }: { visible: boolean; children: ReactNode }) {
  return visible ? children : null;
}

function showSessionWindowControls(sessionPlayback: boolean): boolean {
  return sessionPlayback && isTauri;
}

const pitchAnchors = (config: AppConfig | null) => ({
  horizontal: config?.pitch_graph_horizontal_position,
  vertical: config?.pitch_graph_vertical_position,
});

function playbackOffsets(config: AppConfig | null) {
  return {
    lyricsX: config?.lyrics_offset_x ?? 0,
    lyricsY: config?.lyrics_offset_y ?? 0,
    pitchX: config?.pitch_graph_offset_x ?? 0,
    pitchY: config?.pitch_graph_offset_y ?? 0,
  };
}

function displaySettings(config: AppConfig | null) {
  return {
    lyricsVerticalPosition: config?.lyrics_vertical_position ?? 'bottom',
    lyricsHorizontalPosition: config?.lyrics_horizontal_position ?? 'center',
    lyricsScale: config?.lyrics_scale,
    pitchGraphScale: config?.pitch_graph_scale,
    lyricsRomanizationMode: config?.lyrics_romanization_mode ?? 'enabled',
  };
}

function PlaybackLayout({
  song,
  config,
  queuePlayback,
  sessionPlayback,
  players,
}: PlaybackLayoutProps) {
  const { t } = useI18n();
  const { isReady, exitDialogOpen } = usePlaybackTransportState();
  const { handleContinue, handleExit, handleRestart } = usePlaybackTransportActions();
  const { segments, transcriptSource } = usePlaybackTranscriptState();
  const mic = usePlaybackMicState();
  const offsets = playbackOffsets(config);
  const anchors = pitchAnchors(config);
  const {
    lyricsVerticalPosition,
    lyricsHorizontalPosition,
    lyricsScale,
    pitchGraphScale,
    lyricsRomanizationMode,
  } = displaySettings(config);
  const hudPosition = lyricsVerticalPosition === 'top' ? 'bottom' : 'top';
  const sessionWindowControls = showSessionWindowControls(sessionPlayback);

  const result = usePlaybackResult(song, queuePlayback, players ?? []);
  usePlaybackInput(config, !result.open);

  return (
    <div className="fixed inset-0 overflow-hidden bg-black" style={{ contain: 'strict' }}>
      {isReady ? (
        <>
          <Background />
          <PlaybackHud
            title={song.title}
            artist={song.artist}
            config={config}
            position={hudPosition}
            windowControls={sessionWindowControls}
          />
          <VisiblePlaybackGuide visible={config?.show_pitch_graph !== false}>
            <PitchGraph
              horizontalPosition={anchors.horizontal}
              verticalPosition={anchors.vertical}
              series={mic.series}
              position={hudPosition}
              scale={pitchGraphScale}
              offsetX={offsets.pitchX}
              offsetY={offsets.pitchY}
              windowSeconds={config?.pitch_graph_window_sec ?? undefined}
            />
          </VisiblePlaybackGuide>
          <VisiblePlaybackGuide visible={config?.show_lyrics !== false}>
            <LyricsDisplay
              preserveSpacing={transcriptSource === 'lrc'}
              segments={segments}
              verticalPosition={lyricsVerticalPosition}
              horizontalPosition={lyricsHorizontalPosition}
              scale={lyricsScale}
              romanizationMode={lyricsRomanizationMode}
              offsetX={offsets.lyricsX}
              offsetY={offsets.lyricsY}
            />
          </VisiblePlaybackGuide>
        </>
      ) : (
        <LoadingScreen song={song} />
      )}

      <PauseOverlay
        open={exitDialogOpen && !result.open}
        exitLabel={t('Exit Playback')}
        onContinue={handleContinue}
        onExit={handleExit}
      />

      <ResultDialog
        open={result.open}
        practice={result.practice}
        results={result.results}
        song={song}
        scores={result.scores}
        nextPending={result.nextPending}
        exitLabel={t(sessionPlayback ? 'Exit Playback' : 'Back to Menu')}
        onBack={result.onBack}
        onRestart={handleRestart}
        onNext={result.onNext}
        autoAdvanceSeconds={result.autoAdvanceSeconds}
        onInteraction={result.cancelAutoAdvance}
      />
    </div>
  );
}

export function PlaybackInner({
  song,
  config,
  queuePlayback,
  sessionPlayback,
  players,
}: PlaybackInnerProps) {
  const [attempt, setAttempt] = useState(0);
  const [playbackSong, setPlaybackSong] = useState(song);
  const restart = useCallback(() => setAttempt((current) => current + 1), []);

  return (
    <PlaybackVolumeGate key={attempt} song={playbackSong}>
      <PlaybackProviders
        song={playbackSong}
        config={config}
        players={players}
        onRestart={restart}
        onSongPrepared={setPlaybackSong}
      >
        <PlaybackLayout
          song={playbackSong}
          config={config}
          queuePlayback={queuePlayback}
          sessionPlayback={sessionPlayback}
          players={players}
        />
      </PlaybackProviders>
    </PlaybackVolumeGate>
  );
}
