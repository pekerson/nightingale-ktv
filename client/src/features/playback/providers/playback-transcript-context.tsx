/**
 * Owns the transcript for the active song, the derived skip-intro / skip-outro
 * boundaries, and the handlers that act on them.
 *
 * Skip-outro is a two-step flow: pause the audio engine, then flag the
 * playback result handler to fall through to the result dialog.  That pending
 * flag lives here so the rest of the tree can subscribe to it without a
 * separate piece of useState wiring.
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useIntroVocals } from '@/features/playback/hooks/use-intro-vocals';
import { useManualIntro } from '@/features/playback/hooks/use-manual-intro';
import { usePlaybackTranscript } from '@/features/playback/hooks/use-playback-transcript';
import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers/playback-transport-context';
import {
  chooseIntroBoundary,
  firstSingingLyric,
  type IntroBoundary,
} from '@/shared/audio/intro-boundary';
import type { Segment } from '@/types/Transcript';

export type PlaybackTranscriptState = {
  segments: Segment[];
  transcriptSource: string;
  firstSegmentStart: number;
  lastSegmentEnd: number;
  introSkipLeadSec: number;
  introSkipTarget: number;
  introBoundarySource: IntroBoundary['source'];
  introAnalyzing: boolean;
  skipOutroPending: boolean;
};

export type PlaybackTranscriptActions = {
  canSkipIntro: (time: number) => boolean;
  canSkipOutro: (time: number) => boolean;
  handleSkipIntro: () => void;
  handleSkipOutro: () => void;
  clearSkipOutroPending: () => void;
};

const TranscriptStateContext = createContext<PlaybackTranscriptState | null>(null);
const TranscriptActionsContext = createContext<PlaybackTranscriptActions | null>(null);

type PlaybackTranscriptProviderProps = {
  fileHash: string;
  songTitle: string;
  songArtist: string;
  songTempo: number;
  introSkipLeadSec: number;
  children: ReactNode;
};

function skipBounds(segments: Segment[]) {
  const lyrics = segments.filter((segment) => segment.text.trim().length > 0);
  if (
    lyrics.length === 0 ||
    lyrics.some(
      (segment) =>
        !Number.isFinite(segment.start) ||
        !Number.isFinite(segment.end) ||
        segment.start < 0 ||
        segment.end <= segment.start,
    )
  ) {
    return null;
  }
  return {
    first: Math.min(...lyrics.map((segment) => segment.start)),
    last: Math.max(...lyrics.map((segment) => segment.end)),
  };
}

export function PlaybackTranscriptProvider({
  fileHash,
  songTitle,
  songArtist,
  songTempo,
  introSkipLeadSec,
  children,
}: PlaybackTranscriptProviderProps) {
  const { seek, pauseAudio, getCurrentTime } = usePlaybackTransportActions();
  const { isReady, isFinished, duration } = usePlaybackTransportState();
  const { segments, transcriptSource } = usePlaybackTranscript(fileHash);
  const [skipOutroPending, setSkipOutroPending] = useState(false);

  const bounds = useMemo(() => skipBounds(segments), [segments]);
  const vocals = useIntroVocals();
  const lyricStart = useMemo(
    () => firstSingingLyric(segments, { title: songTitle, artist: songArtist }, vocals.regions),
    [segments, songTitle, songArtist, vocals.regions],
  );
  const manual = useManualIntro(fileHash, songTempo, duration, introSkipLeadSec);
  const automaticIntro = useMemo(
    () => chooseIntroBoundary(lyricStart, vocals.regions, introSkipLeadSec),
    [lyricStart, vocals.regions, introSkipLeadSec],
  );
  const intro = manual.boundary ?? automaticIntro;
  const introAnalyzing =
    manual.pending || (manual.boundary === null && lyricStart === null && vocals.pending);
  const firstSegmentStart = intro.onset;
  const lastSegmentEnd = bounds?.last ?? 0;

  const canSkipIntro = useCallback(
    (time: number) =>
      intro.source !== 'none' &&
      !introAnalyzing &&
      isReady &&
      !isFinished &&
      Number.isFinite(time) &&
      intro.onset < duration &&
      time + 0.15 < intro.target,
    [intro, introAnalyzing, isReady, isFinished, duration],
  );

  const canSkipOutro = useCallback(
    (time: number) =>
      bounds !== null &&
      isReady &&
      !isFinished &&
      !skipOutroPending &&
      Number.isFinite(time) &&
      lastSegmentEnd + 1 < duration &&
      time > lastSegmentEnd + 1,
    [bounds, isReady, isFinished, skipOutroPending, duration, lastSegmentEnd],
  );

  const handleSkipIntro = useCallback(() => {
    if (!canSkipIntro(getCurrentTime())) {
      return;
    }
    seek(intro.target);
  }, [seek, intro.target, canSkipIntro, getCurrentTime]);

  const handleSkipOutro = useCallback(() => {
    if (!canSkipOutro(getCurrentTime())) {
      return;
    }
    // Pause the audio engine WITHOUT raising the user-facing `paused` flag,
    // otherwise PauseOverlay would flash open when the result dialog closes.
    pauseAudio();
    setSkipOutroPending(true);
  }, [pauseAudio, canSkipOutro, getCurrentTime]);

  const clearSkipOutroPending = useCallback(() => {
    setSkipOutroPending(false);
  }, []);

  const stateValue = useMemo<PlaybackTranscriptState>(
    () => ({
      segments,
      transcriptSource,
      firstSegmentStart,
      lastSegmentEnd,
      introSkipLeadSec: intro.lead,
      introSkipTarget: intro.target,
      introBoundarySource: intro.source,
      introAnalyzing,
      skipOutroPending,
    }),
    [
      segments,
      transcriptSource,
      firstSegmentStart,
      lastSegmentEnd,
      skipOutroPending,
      intro,
      introAnalyzing,
    ],
  );

  const actionsValue = useMemo<PlaybackTranscriptActions>(
    () => ({
      canSkipIntro,
      canSkipOutro,
      handleSkipIntro,
      handleSkipOutro,
      clearSkipOutroPending,
    }),
    [canSkipIntro, canSkipOutro, handleSkipIntro, handleSkipOutro, clearSkipOutroPending],
  );

  return (
    <TranscriptStateContext.Provider value={stateValue}>
      <TranscriptActionsContext.Provider value={actionsValue}>
        {children}
      </TranscriptActionsContext.Provider>
    </TranscriptStateContext.Provider>
  );
}

export function usePlaybackTranscriptState(): PlaybackTranscriptState {
  const ctx = useContext(TranscriptStateContext);
  if (!ctx) {
    throw new Error('usePlaybackTranscriptState must be used within a PlaybackTranscriptProvider');
  }
  return ctx;
}

export function usePlaybackTranscriptActions(): PlaybackTranscriptActions {
  const ctx = useContext(TranscriptActionsContext);
  if (!ctx) {
    throw new Error(
      'usePlaybackTranscriptActions must be used within a PlaybackTranscriptProvider',
    );
  }
  return ctx;
}
