import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router';
/**
 * Owns the audio engine for the active song: wraps `useAudioPlayer`, the
 * stems-ready handshake, the user-facing `paused` flag, and the pause/continue/
 * exit handlers shared by overlays, hotkeys, and the result dialog.
 *
 * Splits state and actions into two contexts so consumers that only need
 * stable callbacks (subscribe, getCurrentTime, handlePause...) don't re-render
 * when reactive fields like `isPlaying` or `guideVolume` change.
 */
import { toast } from 'sonner';

import { ensureMp3Stems, onStemsReady } from '@/bridge/playback';
import { isSessionPlayback } from '@/bridge/playback-session';
import { closePlaybackWindow } from '@/bridge/window';
import {
  type AudioPlayer,
  type TimeSubscriber,
  useAudioPlayer,
} from '@/features/playback/hooks/use-audio-player';
import { useLiveKey } from '@/features/playback/hooks/use-live-key';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { Song } from '@/types/Song';

export type PlaybackTransportState = {
  isReady: boolean;
  isPlaying: boolean;
  isFinished: boolean;
  paused: boolean;
  exitDialogOpen: boolean;
  practice: boolean;
  hasSeeked: boolean;
  scoreAfterSeek: boolean;
  duration: number;
  guideVolume: number;
  instrumentalVolume: number;
  currentKey: string | null;
  keyOffset: number;
  keyAvailable: boolean;
  isChangingKey: boolean;
  guideAvailable: boolean;
  error: string | null;
};

export type PlaybackTransportActions = {
  subscribe: (fn: TimeSubscriber) => () => void;
  getCurrentTime: () => number;
  seek: (time: number) => void;
  seekFromControl: (time: number) => void;
  subscribeSeek: (fn: TimeSubscriber) => () => void;
  finalizePlayback: () => boolean;
  setGuideVolume: (volume: number) => void;
  setInstrumentalVolume: (volume: number) => void;
  shiftKey: (direction: -1 | 1) => void;
  getVocalsBuffer: AudioPlayer['getVocalsBuffer'];
  getScoringBuffer: AudioPlayer['getScoringBuffer'];
  getAudioContext: AudioPlayer['getAudioContext'];
  /** Raw audio-engine pause; does NOT raise the `paused` UI flag. */
  pauseAudio: () => void;
  handlePause: () => void;
  handleOpenExit: () => void;
  handleFinish: () => void;
  handleContinue: () => void;
  handleExit: () => void;
  handleRestart: () => void;
};

const TransportStateContext = createContext<PlaybackTransportState | null>(null);
const TransportActionsContext = createContext<PlaybackTransportActions | null>(null);

type PlaybackTransportProviderProps = {
  song: Song;
  onSongPrepared: (song: Song) => void;
  initialGuideVolume: number;
  initialMasterVolume: number;
  initialInstrumentalVolume: number;
  replayGainEnabled: boolean;
  replayGainPreampDb: number;
  scoreAfterSeek: boolean;
  onRestart: () => void;
  children: ReactNode;
};

export function PlaybackTransportProvider({
  song,
  onSongPrepared,
  initialGuideVolume,
  initialMasterVolume,
  initialInstrumentalVolume,
  replayGainEnabled,
  replayGainPreampDb,
  scoreAfterSeek,
  onRestart,
  children,
}: PlaybackTransportProviderProps) {
  const { t } = useI18n();
  const tRef = useLatestRef(t);
  const navigate = useNavigate();
  const fileHash = song.file_hash;
  // Snapshot the initial guide volume so changing config later doesn't
  // re-instantiate the audio engine via useAudioPlayer's effect deps.
  const [initialGuideVolumeSnapshot] = useState(initialGuideVolume);
  const [initialMasterVolumeSnapshot] = useState(initialMasterVolume);
  const [initialInstrumentalSnapshot] = useState(initialInstrumentalVolume);

  const [stemsReady, setStemsReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [exitDialogOpen, setExitDialogOpen] = useState(false);
  const exitDialogRef = useRef(false);
  const [finishRequested, setFinishRequested] = useState(false);
  const [hasSeeked, setHasSeeked] = useState(false);
  const hasSeekedRef = useRef(false);
  const scoreAfterSeekRef = useLatestRef(scoreAfterSeek);
  const [finalPractice, setFinalPractice] = useState<boolean | null>(null);
  const finalPracticeRef = useRef<boolean | null>(null);
  const practice = finalPractice ?? (hasSeeked && !scoreAfterSeek);
  const finalizedRef = useRef(false);
  const restartRequestedRef = useRef(false);
  const seekSubscribersRef = useRef(new Set<TimeSubscriber>());

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;

    // Register the listener BEFORE invoking the command. On a page reload the
    // WS handshake races the `stems-ready` broadcast — if the listener isn't
    // attached (or the socket isn't open) when the server emits, the event
    // is gone forever and `stemsReady` stays false, leaving the page stuck
    // on a black screen. `onStemsReady` awaits the socket open under the
    // hood, so once its promise resolves we are guaranteed to receive the
    // event the command triggers.
    void onStemsReady((event) => {
      if (event.file_hash !== fileHash) {
        return;
      }
      if (typeof event.error === 'string' && event.error !== '') {
        toast.error(tRef.current('Stem conversion failed: {error}', { error: event.error }));
        void navigate('/', { replace: true });
      } else {
        setStemsReady(true);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
        return undefined;
      }
      unlisten = fn;
      ensureMp3Stems(fileHash);
      return undefined;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [fileHash, navigate, tRef]);

  const audio = useAudioPlayer(
    fileHash,
    {
      guide: initialGuideVolumeSnapshot,
      master: initialMasterVolumeSnapshot,
      instrumental: initialInstrumentalSnapshot,
      replayGainEnabled,
      replayGainPreampDb,
    },
    stemsReady,
  );

  const {
    setGuideVolume,
    setInstrumentalVolume,
    setMasterVolume,
    setReplayGainSettings,
    isReady: audioReadyForGain,
  } = audio;
  useEffect(() => {
    setReplayGainSettings({ enabled: replayGainEnabled, preampDb: replayGainPreampDb });
  }, [replayGainEnabled, replayGainPreampDb, setReplayGainSettings]);
  useEffect(() => {
    if (audioReadyForGain) {
      setGuideVolume(initialGuideVolume);
    }
  }, [initialGuideVolume, setGuideVolume, audioReadyForGain]);
  useEffect(() => {
    if (audioReadyForGain) {
      setInstrumentalVolume(initialInstrumentalVolume);
    }
  }, [initialInstrumentalVolume, setInstrumentalVolume, audioReadyForGain]);
  useEffect(() => {
    if (audioReadyForGain) {
      setMasterVolume(initialMasterVolume);
    }
  }, [initialMasterVolume, setMasterVolume, audioReadyForGain]);

  const canCommitKey = useCallback(() => !finalizedRef.current && !restartRequestedRef.current, []);
  const { getCurrentTime: currentTime } = audio;
  const onReferenceChanged = useCallback(() => {
    const time = currentTime();
    for (const subscriber of seekSubscribersRef.current) {
      subscriber(time);
    }
  }, [currentTime]);
  const keyControl = useLiveKey({
    song,
    isReady: audio.isReady,
    onPrepared: onSongPrepared,
    reloadBuffers: audio.reloadBuffers,
    canCommit: canCommitKey,
    onReferenceChanged,
  });

  useEffect(() => {
    if (typeof audio.error === 'string' && audio.error !== '') {
      toast.error(tRef.current('Audio playback failed: {error}', { error: audio.error }));
      void navigate('/', { replace: true });
    }
  }, [audio.error, navigate, tRef]);

  const handlePause = useCallback(() => {
    if (finalizedRef.current) {
      return;
    }
    audio.pause();
    setPaused(true);
  }, [audio]);

  const handleOpenExit = useCallback(() => {
    if (finalizedRef.current || exitDialogRef.current) {
      return;
    }
    exitDialogRef.current = true;
    audio.pause();
    setPaused(true);
    setExitDialogOpen(true);
  }, [audio]);

  const subscribeSeek = useCallback((fn: TimeSubscriber) => {
    seekSubscribersRef.current.add(fn);
    return () => {
      seekSubscribersRef.current.delete(fn);
    };
  }, []);

  const { duration: audioDuration, isReady: audioReady, seek: seekAudio, getCurrentTime } = audio;

  const seek = useCallback(
    (time: number) => {
      if (!Number.isFinite(time) || !audioReady || finalizedRef.current) {
        return;
      }
      const target = Math.max(0, Math.min(time, audioDuration));
      for (const subscriber of seekSubscribersRef.current) {
        subscriber(target);
      }
      seekAudio(target);
    },
    [audioDuration, audioReady, seekAudio],
  );

  const seekFromControl = useCallback(
    (time: number) => {
      if (!Number.isFinite(time) || !audioReady || audioDuration <= 0 || finalizedRef.current) {
        return;
      }
      const target = Math.max(0, Math.min(time, Math.max(0, audioDuration - 0.05)));
      if (Math.abs(target - getCurrentTime()) < 0.01) {
        return;
      }
      hasSeekedRef.current = true;
      setHasSeeked(true);
      seek(target);
    },
    [audioDuration, getCurrentTime, audioReady, seek],
  );

  const finalizePlayback = useCallback(() => {
    if (finalPracticeRef.current !== null) {
      return finalPracticeRef.current;
    }
    const result = hasSeekedRef.current && !scoreAfterSeekRef.current;
    finalizedRef.current = true;
    finalPracticeRef.current = result;
    setFinalPractice(result);
    return result;
  }, [scoreAfterSeekRef]);

  const handleFinish = useCallback(() => {
    if (finalizedRef.current || !audio.isReady) {
      return;
    }
    finalizePlayback();
    audio.pause();
    setPaused(false);
    setExitDialogOpen(false);
    exitDialogRef.current = false;
    setFinishRequested(true);
  }, [audio, finalizePlayback]);

  const handleContinue = useCallback(() => {
    if (finalizedRef.current) {
      return;
    }
    exitDialogRef.current = false;
    setExitDialogOpen(false);
    setPaused(false);
    audio.resume();
  }, [audio]);

  const handleExit = useCallback(() => {
    audio.cleanup();
    if (isSessionPlayback()) {
      void closePlaybackWindow();
      return;
    }
    void navigate('/', { replace: true });
  }, [audio, navigate]);

  const { isKeyChangePending } = keyControl;
  const handleRestart = useCallback(() => {
    if (restartRequestedRef.current || isKeyChangePending()) {
      return;
    }
    restartRequestedRef.current = true;
    audio.cleanup();
    onRestart();
  }, [audio, onRestart, isKeyChangePending]);

  const stateValue = useMemo<PlaybackTransportState>(
    () => ({
      isReady: audio.isReady,
      isPlaying: audio.isPlaying,
      isFinished: audio.isFinished || finishRequested,
      paused,
      exitDialogOpen,
      practice,
      hasSeeked,
      scoreAfterSeek,
      duration: audio.duration,
      guideVolume: audio.guideVolume,
      instrumentalVolume: audio.instrumentalVolume,
      currentKey: keyControl.currentKey,
      keyOffset: keyControl.keyOffset,
      keyAvailable: keyControl.keyAvailable,
      isChangingKey: keyControl.isChangingKey,
      guideAvailable: audio.guideAvailable,
      error: audio.error,
    }),
    [
      audio.isReady,
      audio.isPlaying,
      audio.isFinished,
      audio.duration,
      audio.guideVolume,
      audio.instrumentalVolume,
      keyControl.currentKey,
      keyControl.keyOffset,
      keyControl.keyAvailable,
      keyControl.isChangingKey,
      audio.guideAvailable,
      audio.error,
      paused,
      exitDialogOpen,
      finishRequested,
      practice,
      hasSeeked,
      scoreAfterSeek,
    ],
  );

  const actionsValue = useMemo<PlaybackTransportActions>(
    () => ({
      subscribe: audio.subscribe,
      getCurrentTime: audio.getCurrentTime,
      seek,
      seekFromControl,
      subscribeSeek,
      finalizePlayback,
      setGuideVolume: audio.setGuideVolume,
      setInstrumentalVolume: audio.setInstrumentalVolume,
      shiftKey: keyControl.shiftKey,
      getVocalsBuffer: audio.getVocalsBuffer,
      getScoringBuffer: audio.getScoringBuffer,
      getAudioContext: audio.getAudioContext,
      pauseAudio: audio.pause,
      handlePause,
      handleOpenExit,
      handleFinish,
      handleContinue,
      handleExit,
      handleRestart,
    }),
    [
      audio.subscribe,
      audio.getCurrentTime,
      seek,
      seekFromControl,
      subscribeSeek,
      finalizePlayback,
      audio.setGuideVolume,
      audio.setInstrumentalVolume,
      keyControl.shiftKey,
      audio.getVocalsBuffer,
      audio.getScoringBuffer,
      audio.getAudioContext,
      audio.pause,
      handlePause,
      handleOpenExit,
      handleFinish,
      handleContinue,
      handleExit,
      handleRestart,
    ],
  );

  return (
    <TransportStateContext.Provider value={stateValue}>
      <TransportActionsContext.Provider value={actionsValue}>
        {children}
      </TransportActionsContext.Provider>
    </TransportStateContext.Provider>
  );
}

export function usePlaybackTransportState(): PlaybackTransportState {
  const ctx = useContext(TransportStateContext);
  if (!ctx) {
    throw new Error('usePlaybackTransportState must be used within a PlaybackTransportProvider');
  }
  return ctx;
}

export function usePlaybackTransportActions(): PlaybackTransportActions {
  const ctx = useContext(TransportActionsContext);
  if (!ctx) {
    throw new Error('usePlaybackTransportActions must be used within a PlaybackTransportProvider');
  }
  return ctx;
}
