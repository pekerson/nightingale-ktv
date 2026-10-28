import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import successSoundUrl from '@/assets/sounds/success.mp3';
import type { PlaybackPlayer } from '@/bridge/playback-session';
import { addScore } from '@/bridge/profile';
import {
  usePlaybackQueueQuery,
  useStartNextPlaybackQueueSong,
} from '@/features/playback-queue/use-playback-queue';
import {
  usePlaybackMicState,
  usePlaybackTranscriptActions,
  usePlaybackTranscriptState,
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import { useProfiles } from '@/features/profiles/queries/use-profiles';
import { useConfig } from '@/shared/config/use-config';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import { defaultPlayerColor, type PlayerColor } from '@/shared/player-colors';
import { PROFILES } from '@/shared/query-keys';
import type { AppConfig } from '@/types/AppConfig';
import type { ScoreRecord } from '@/types/ScoreRecord';
import type { Song } from '@/types/Song';

export type PlaybackPlayerResult = {
  id: string;
  profile: string | null;
  color: PlayerColor;
  score: number;
};

type FinalResultsInput = {
  multiplayer: boolean;
  players: ReturnType<typeof usePlaybackMicState>['players'];
  activeProfile: string | null;
  soloScore: number;
};

function buildFinalResults(input: FinalResultsInput): PlaybackPlayerResult[] {
  if (!input.multiplayer) {
    return [
      {
        id: 'solo',
        profile: input.activeProfile,
        color: defaultPlayerColor(0),
        score: input.soloScore,
      },
    ];
  }
  return input.players.map((player) => ({
    id: player.id,
    profile: player.profile,
    color: player.color,
    score: player.rawScore,
  }));
}

function playbackHasEnded(isFinished: boolean, skipOutroPending: boolean): boolean {
  return isFinished || skipOutroPending;
}

function finishReady(
  isFinished: boolean,
  skipOutroPending: boolean,
  profilesLoading: boolean,
  alreadyHandled: boolean,
): boolean {
  return playbackHasEnded(isFinished, skipOutroPending) && !profilesLoading && !alreadyHandled;
}

export type PlaybackResult = {
  open: boolean;
  practice: boolean;
  results: PlaybackPlayerResult[];
  scores: ScoreRecord[];
  nextPending: boolean;
  autoAdvanceSeconds: number | null;
  cancelAutoAdvance: () => void;
  onBack: () => void;
  onNext?: (players?: readonly PlaybackPlayer[]) => void;
};

type AutoAdvanceInput = {
  open: boolean;
  eligible: boolean;
  enabled: boolean;
  delaySeconds: number;
  advance: () => void;
};

function autoAdvanceDelay(value: number | null | undefined): number {
  const seconds = value ?? 5;
  return Number.isFinite(seconds) ? Math.min(60, Math.max(1, Math.round(seconds))) : 5;
}

function useAutoAdvance({ open, eligible, enabled, delaySeconds, advance }: AutoAdvanceInput) {
  const [seconds, setSeconds] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const cancelledRef = useRef(false);
  const advanceRef = useLatestRef(advance);
  const cancel = useCallback(() => {
    cancelledRef.current = true;
    setCancelled(true);
    setSeconds(null);
  }, []);

  const active = open && eligible && enabled && !cancelled;
  const activeRef = useLatestRef(active);
  const delayRef = useLatestRef(delaySeconds);
  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const deadline = performance.now() + delaySeconds * 1000;
    const tick = () => {
      if (cancelledRef.current || !activeRef.current || delayRef.current !== delaySeconds) {
        return;
      }
      const remaining = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      setSeconds(remaining);
      if (remaining === 0) {
        cancel();
        advanceRef.current();
      }
    };
    const initialTick = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 100);
    return () => {
      window.clearTimeout(initialTick);
      window.clearInterval(timer);
    };
  }, [active, activeRef, delaySeconds, delayRef, advanceRef, cancel]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    window.addEventListener('pointerdown', cancel, true);
    window.addEventListener('keydown', cancel, true);
    window.addEventListener('wheel', cancel, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', cancel, true);
      window.removeEventListener('keydown', cancel, true);
      window.removeEventListener('wheel', cancel, true);
    };
  }, [open, cancel]);

  return { seconds: active ? (seconds ?? delaySeconds) : null, cancel };
}

function autoAdvanceSettings(config: AppConfig | undefined) {
  return {
    enabled: config?.queue_auto_advance !== false,
    delaySeconds: autoAdvanceDelay(config?.queue_auto_advance_delay_sec),
  };
}

export function usePlaybackResult(
  song: Song,
  queuePlayback: boolean,
  players: readonly PlaybackPlayer[],
): PlaybackResult {
  const { t } = useI18n();
  const tRef = useLatestRef(t);
  const fileHash = song.file_hash;
  const queryClient = useQueryClient();
  const { data: profileData, isLoading: profilesLoading, isError: profilesError } = useProfiles();
  const { data: entries = [] } = usePlaybackQueueQuery();
  const { data: config } = useConfig();
  const { isPreparing, hasError, playNext } = useStartNextPlaybackQueueSong(entries);

  const { isFinished, isChangingKey } = usePlaybackTransportState();
  const { handleExit, finalizePlayback } = usePlaybackTransportActions();
  const { rawScore, players: micPlayers, multiplayer } = usePlaybackMicState();
  const { skipOutroPending } = usePlaybackTranscriptState();
  const { clearSkipOutroPending } = usePlaybackTranscriptActions();

  const [showResult, setShowResult] = useState(false);
  const [practice, setPractice] = useState(false);
  const [results, setResults] = useState<PlaybackPlayerResult[]>([]);
  const [scoreSaveFailed, setScoreSaveFailed] = useState(false);
  const nextRequestedRef = useRef(false);
  const changingKeyRef = useLatestRef(isChangingKey);
  const micPlayersRef = useLatestRef(micPlayers);
  const scoreRef = useLatestRef(rawScore);
  const finishHandledRef = useRef(false);

  useEffect(() => {
    if (!playbackHasEnded(isFinished, skipOutroPending)) {
      return;
    }
    const finalPractice = finalizePlayback();
    if (!finishReady(isFinished, skipOutroPending, profilesLoading, finishHandledRef.current)) {
      return;
    }

    finishHandledRef.current = true;
    setPractice(finalPractice);
    clearSkipOutroPending();

    const finalResults = buildFinalResults({
      multiplayer,
      players: micPlayersRef.current,
      activeProfile: profileData?.active ?? null,
      soloScore: scoreRef.current,
    });
    void (async () => {
      try {
        if (profilesError) {
          throw new Error(
            tRef.current('Could not load player profiles. Automatic next song has been stopped.'),
          );
        }
        if (!finalPractice) {
          await Promise.all(
            finalResults.flatMap((result) =>
              result.profile === null ? [] : [addScore(fileHash, result.score, result.profile)],
            ),
          );
          if (finalResults.some((result) => result.profile !== null)) {
            await queryClient.invalidateQueries({ queryKey: PROFILES });
          }
        }
      } catch (error) {
        setScoreSaveFailed(true);
        toast.error(
          tRef.current('Could not save score: {error}', {
            error: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      setResults(
        finalPractice
          ? finalResults
          : finalResults.toSorted((left, right) => right.score - left.score),
      );
      setShowResult(true);
    })();
  }, [
    tRef,
    clearSkipOutroPending,
    fileHash,
    finalizePlayback,
    isFinished,
    micPlayersRef,
    multiplayer,
    profileData?.active,
    profilesLoading,
    profilesError,
    queryClient,
    scoreRef,
    skipOutroPending,
  ]);

  useEffect(() => {
    if (!showResult || practice) {
      return undefined;
    }

    const audioElement = new Audio(successSoundUrl);
    void audioElement.play().catch(() => {});

    return () => {
      audioElement.pause();
      audioElement.src = '';
    };
  }, [showResult, practice]);

  const startNext = useCallback(
    (nextPlayers: readonly PlaybackPlayer[] = players) => {
      if (nextRequestedRef.current || changingKeyRef.current) {
        return;
      }
      nextRequestedRef.current = true;
      if (!playNext([...nextPlayers])) {
        nextRequestedRef.current = false;
      }
    },
    [playNext, players, changingKeyRef],
  );
  useEffect(() => {
    if (hasError) {
      nextRequestedRef.current = false;
    }
  }, [hasError]);
  const hasNext = queuePlayback && entries.length > 0;
  const { seconds: autoAdvanceSeconds, cancel: cancelAutoAdvance } = useAutoAdvance({
    open: showResult,
    eligible: hasNext && !isPreparing && !scoreSaveFailed && !isChangingKey,
    ...autoAdvanceSettings(config),
    advance: startNext,
  });
  const onBack = useCallback(() => {
    cancelAutoAdvance();
    setShowResult(false);
    handleExit();
  }, [cancelAutoAdvance, handleExit]);
  const onNext = useCallback(
    (nextPlayers: readonly PlaybackPlayer[] = players) => {
      cancelAutoAdvance();
      startNext(nextPlayers);
    },
    [cancelAutoAdvance, startNext, players],
  );

  return {
    open: showResult,
    practice,
    results,
    scores: profileData?.scores ?? [],
    nextPending: isPreparing,
    autoAdvanceSeconds,
    cancelAutoAdvance,
    onBack,
    onNext: hasNext ? onNext : undefined,
  };
}
