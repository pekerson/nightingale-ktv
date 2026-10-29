/**
 * Web Audio–based playback for instrumental + guide vocals, with a shared
 * rAF tick that notifies subscribers for visuals (background sync, lyrics, HUD).
 * The returned API object is referentially stable across renders when its fields are unchanged.
 *
 * Graph: instrumental buffer → instrumental gain → output router;
 * vocals buffer → guide gain → output router. Song ReplayGain is multiplied
 * into both stem gains, leaving microphone monitoring and slider values alone.
 * Playback position is derived from AudioContext.currentTime and a (offset, contextTimeAtStart)
 * pair because BufferSourceNode is one-shot: pause/seek recreate sources rather than mutating time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AudioOutputRouter } from '@/bridge/audio-output-router';
import type { PlaybackAdapter } from '@/bridge/playback';
import { playbackAdapter } from '@/bridge/playback';
import type { AudioPaths } from '@/types/Transcript';

export type TimeSubscriber = (time: number) => void;

type InitialVolumes = {
  guide: number;
  master: number;
  instrumental: number;
  replayGainEnabled: boolean;
  replayGainPreampDb: number;
};

type ReplayGainSettings = {
  enabled: boolean;
  preampDb: number;
};

function replayGainMultiplier(
  gainDb: number | null,
  peak: number | null,
  settings: ReplayGainSettings,
): number {
  if (!settings.enabled || gainDb === null || !Number.isFinite(gainDb)) {
    return 1;
  }
  const preampDb = Number.isFinite(settings.preampDb)
    ? Math.max(0, Math.min(10, settings.preampDb))
    : 0;
  const requested = 10 ** ((gainDb + preampDb) / 20);
  if (!Number.isFinite(requested) || requested <= 0) {
    return 1;
  }
  return peak !== null && Number.isFinite(peak) && peak > 0
    ? Math.min(requested, 1 / peak)
    : requested;
}

function replayGainMetadata(paths: AudioPaths): { gainDb: number | null; peak: number | null } {
  const gainDb = paths.replay_gain_db;
  const peak = paths.replay_peak;
  return {
    gainDb: typeof gainDb === 'number' && Number.isFinite(gainDb) ? gainDb : null,
    peak: typeof peak === 'number' && Number.isFinite(peak) && peak > 0 ? peak : null,
  };
}

export type AudioPlayer = {
  getCurrentTime: () => number;
  subscribe: (fn: TimeSubscriber) => () => void;
  duration: number;
  isReady: boolean;
  isPlaying: boolean;
  isFinished: boolean;
  error: string | null;
  guideVolume: number;
  instrumentalVolume: number;
  /** False for LRC-provided songs without stems: the original mix plays and
   * there is no separate guide vocal track to control. */
  guideAvailable: boolean;
  play: () => void;
  pause: () => void;
  resume: () => void;
  seek: (time: number) => void;
  setGuideVolume: (v: number) => void;
  setInstrumentalVolume: (v: number) => void;
  setMasterVolume: (v: number) => void;
  setReplayGainSettings: (settings: ReplayGainSettings) => void;
  reloadBuffers: (canCommit: () => boolean) => Promise<boolean>;
  cleanup: () => void;
  getVocalsBuffer: () => AudioBuffer | null;
  getScoringBuffer: () => AudioBuffer | null;
  getAudioContext: () => AudioContext | null;
};

export function useAudioPlayer(
  fileHash: string,
  initialVolumes: InitialVolumes,
  enabled: boolean,
  adapter: PlaybackAdapter = playbackAdapter,
): AudioPlayer {
  const {
    guide: initialGuideVolume,
    master: initialMasterVolume,
    instrumental: initialInstrumentalVolume,
    replayGainEnabled: initialReplayGainEnabled,
    replayGainPreampDb: initialReplayGainPreampDb,
  } = initialVolumes;
  const routerRef = useRef<AudioOutputRouter | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const instrumentalBufRef = useRef<AudioBuffer | null>(null);
  const vocalsBufRef = useRef<AudioBuffer | null>(null);
  const instrumentalSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const vocalsSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const vocalsGainRef = useRef<GainNode | null>(null);
  const instrumentalGainRef = useRef<GainNode | null>(null);
  const guideVolumeRef = useRef(initialGuideVolume);
  const instrumentalVolumeRef = useRef(initialInstrumentalVolume);
  const replayGainDbRef = useRef<number | null>(null);
  const replayPeakRef = useRef<number | null>(null);
  const replayGainSettingsRef = useRef<ReplayGainSettings>({
    enabled: initialReplayGainEnabled,
    preampDb: initialReplayGainPreampDb,
  });
  const rafRef = useRef<number>(0);
  const currentTimeRef = useRef(0);
  const subscribersRef = useRef<Set<TimeSubscriber>>(new Set());
  /** Logical playback position (seconds) when the current sources were started. */
  const startOffsetRef = useRef(0);
  /** ctx.currentTime at the moment the current sources started (anchors wall-clock math). */
  const startContextTimeRef = useRef(0);
  const playingRef = useRef(false);
  const finishedRef = useRef(false);
  /** Set on cleanup so async decode/start and onended ignore stale work after unmount. */
  const cancelledRef = useRef(false);

  const [duration, setDuration] = useState(0);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideVolume, setGuideVolumeState] = useState(initialGuideVolume);
  const [instrumentalVolume, setInstrumentalVolumeState] = useState(initialInstrumentalVolume);
  const [guideAvailable, setGuideAvailable] = useState(true);

  const applyReplayGain = useCallback(() => {
    const multiplier = replayGainMultiplier(
      replayGainDbRef.current,
      replayPeakRef.current,
      replayGainSettingsRef.current,
    );
    if (vocalsGainRef.current) {
      vocalsGainRef.current.gain.value = guideVolumeRef.current * multiplier;
    }
    if (instrumentalGainRef.current) {
      instrumentalGainRef.current.gain.value = instrumentalVolumeRef.current * multiplier;
    }
  }, []);

  const applyReplayGainFromPaths = useCallback(
    (paths: AudioPaths) => {
      const { gainDb, peak } = replayGainMetadata(paths);
      replayGainDbRef.current = gainDb;
      replayPeakRef.current = peak;
      applyReplayGain();
    },
    [applyReplayGain],
  );

  const setReplayGainSettings = useCallback(
    (settings: ReplayGainSettings) => {
      replayGainSettingsRef.current = settings;
      applyReplayGain();
    },
    [applyReplayGain],
  );

  const getVocalsBuffer = useCallback(() => vocalsBufRef.current, []);

  const getScoringBuffer = useCallback(
    () => vocalsBufRef.current ?? instrumentalBufRef.current,
    [],
  );

  const getAudioContext = useCallback(() => ctxRef.current, []);

  const getCurrentTime = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx || !playingRef.current) {
      return currentTimeRef.current;
    }

    return startOffsetRef.current + (ctx.currentTime - startContextTimeRef.current);
  }, []);

  const subscribe = useCallback((fn: TimeSubscriber) => {
    subscribersRef.current.add(fn);

    return () => {
      subscribersRef.current.delete(fn);
    };
  }, []);

  const notifySubscribers = useCallback((t: number) => {
    for (const fn of subscribersRef.current) {
      fn(t);
    }
  }, []);

  const stopSources = useCallback(() => {
    playingRef.current = false;

    try {
      instrumentalSrcRef.current?.stop();
    } catch {
      /* BufferSourceNode throws if stopped twice */
    }
    try {
      vocalsSrcRef.current?.stop();
    } catch {
      /* BufferSourceNode throws if stopped twice */
    }

    instrumentalSrcRef.current = null;
    vocalsSrcRef.current = null;
  }, []);

  const startSources = useCallback(
    (offset: number) => {
      const ctx = ctxRef.current;
      const instBuf = instrumentalBufRef.current;
      const vocBuf = vocalsBufRef.current;
      const gainNode = vocalsGainRef.current;
      const instrumentalGainNode = instrumentalGainRef.current;

      if (!ctx || !instBuf || !instrumentalGainNode) {
        return;
      }

      stopSources();

      const clamped = Math.max(0, Math.min(offset, instBuf.duration));

      const instSrc = ctx.createBufferSource();
      instSrc.buffer = instBuf;
      instSrc.connect(instrumentalGainNode);

      instSrc.addEventListener(
        'ended',
        () => {
          if (
            !cancelledRef.current &&
            playingRef.current &&
            instrumentalSrcRef.current === instSrc
          ) {
            playingRef.current = false;
            finishedRef.current = true;

            setIsFinished(true);
            setIsPlaying(false);
          }
        },
        { once: true },
      );

      startOffsetRef.current = clamped;
      startContextTimeRef.current = ctx.currentTime;

      instSrc.start(0, clamped);
      instrumentalSrcRef.current = instSrc;

      // No vocals stem (LRC-provided, no separation): play the original mix
      // through the instrumental node only.
      if (vocBuf && gainNode) {
        const vocSrc = ctx.createBufferSource();
        vocSrc.buffer = vocBuf;
        vocSrc.connect(gainNode);
        vocSrc.start(0, clamped);
        vocalsSrcRef.current = vocSrc;
      }

      playingRef.current = true;
    },
    [stopSources],
  );

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    cancelledRef.current = false;
    playingRef.current = false;
    finishedRef.current = false;

    startOffsetRef.current = 0;
    startContextTimeRef.current = 0;
    currentTimeRef.current = 0;
    replayGainDbRef.current = null;
    replayPeakRef.current = null;
    guideVolumeRef.current = Math.max(0, Math.min(1, initialGuideVolume));
    instrumentalVolumeRef.current = Math.max(0, Math.min(1, initialInstrumentalVolume));

    const ctx = new AudioContext();
    ctxRef.current = ctx;

    const instrumentalGainNode = ctx.createGain();
    instrumentalGainNode.gain.value = instrumentalVolumeRef.current;

    instrumentalGainRef.current = instrumentalGainNode;

    const gainNode = ctx.createGain();
    gainNode.gain.value = guideVolumeRef.current;

    vocalsGainRef.current = gainNode;

    const router = new AudioOutputRouter(
      ctx,
      { accompaniment: instrumentalGainNode, vocals: gainNode },
      initialMasterVolume,
    );
    routerRef.current = router;
    const isCancelled = () => cancelled || cancelledRef.current;

    adapter
      .getAudioPaths(fileHash)
      .then(async (paths) => {
        if (isCancelled()) {
          return undefined;
        }

        const vocalsUrl = paths.vocals;
        setGuideAvailable(vocalsUrl !== null);
        applyReplayGainFromPaths(paths);

        const [instData, vocData] = await Promise.all([
          fetch(paths.instrumental).then((r) => {
            if (!r.ok) {
              throw new Error(`Failed to fetch instrumental: ${r.status}`);
            }

            return r.arrayBuffer();
          }),

          vocalsUrl === null
            ? Promise.resolve(null)
            : fetch(vocalsUrl).then((r) => {
                if (!r.ok) {
                  throw new Error(`Failed to fetch vocals: ${r.status}`);
                }

                return r.arrayBuffer();
              }),
        ]);

        if (isCancelled()) {
          return undefined;
        }

        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const [instBuf, vocBuf] = await Promise.all([
          ctx.decodeAudioData(instData),
          vocData === null ? Promise.resolve(null) : ctx.decodeAudioData(vocData),
        ]);

        if (isCancelled()) {
          return undefined;
        }

        instrumentalBufRef.current = instBuf;
        vocalsBufRef.current = vocBuf;

        setDuration(instBuf.duration);

        await router.ready;
        if (isCancelled()) {
          return undefined;
        }
        startSources(0);
        setIsReady(true);
        setIsPlaying(true);
        return undefined;
      })
      .catch((e: unknown) => {
        if (!isCancelled()) {
          setError(`Failed to load audio: ${e instanceof Error ? e.message : String(e)}`);
        }
      });

    let lastNotify = 0;
    const NOTIFY_INTERVAL = 33;

    const tick = () => {
      if (isCancelled()) {
        return;
      }

      if (playingRef.current && ctxRef.current) {
        const now = performance.now();
        const t =
          startOffsetRef.current + (ctxRef.current.currentTime - startContextTimeRef.current);
        currentTimeRef.current = t;

        if (now - lastNotify >= NOTIFY_INTERVAL) {
          lastNotify = now;
          for (const fn of subscribersRef.current) {
            fn(t);
          }
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      router.dispose();
      cancelAnimationFrame(rafRef.current);
      stopSources();
      instrumentalBufRef.current = null;
      vocalsBufRef.current = null;
      vocalsGainRef.current = null;
      instrumentalGainRef.current = null;
      replayGainDbRef.current = null;
      replayPeakRef.current = null;
      if (ctx.state !== 'closed') {
        void ctx.close();
      }
      ctxRef.current = null;
    };
  }, [
    adapter,
    enabled,
    fileHash,
    initialGuideVolume,
    initialMasterVolume,
    initialInstrumentalVolume,
    applyReplayGainFromPaths,
    startSources,
    stopSources,
  ]);

  const play = useCallback(() => {
    startSources(startOffsetRef.current);
    setIsPlaying(true);
  }, [startSources]);

  const pause = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && playingRef.current) {
      startOffsetRef.current += ctx.currentTime - startContextTimeRef.current;
      currentTimeRef.current = startOffsetRef.current;
    }

    stopSources();
    setIsPlaying(false);
  }, [stopSources]);

  const resume = useCallback(() => {
    startSources(startOffsetRef.current);
    setIsPlaying(true);
  }, [startSources]);

  const seek = useCallback(
    (time: number) => {
      const wasPlaying = playingRef.current;

      stopSources();

      startOffsetRef.current = time;
      currentTimeRef.current = time;

      if (wasPlaying) {
        startSources(time);
        setIsPlaying(true);
      }

      notifySubscribers(time);
      finishedRef.current = false;
      setIsFinished(false);
    },
    [stopSources, startSources, notifySubscribers],
  );

  const setGuideVolume = useCallback(
    (v: number) => {
      const clamped = Math.max(0, Math.min(1, v));

      setGuideVolumeState(clamped);
      guideVolumeRef.current = clamped;
      applyReplayGain();
    },
    [applyReplayGain],
  );

  const setInstrumentalVolume = useCallback(
    (value: number) => {
      const clamped = Math.max(0, Math.min(1, value));
      setInstrumentalVolumeState(clamped);
      instrumentalVolumeRef.current = clamped;
      applyReplayGain();
    },
    [applyReplayGain],
  );

  const setMasterVolume = useCallback((value: number) => {
    routerRef.current?.setVolume(Math.max(0, Math.min(1, value)));
  }, []);

  const reloadBuffers = useCallback(
    async (canCommit: () => boolean) => {
      const context = ctxRef.current;
      const isCancelled = () => cancelledRef.current || context !== ctxRef.current;
      if (!context || isCancelled()) {
        return false;
      }
      const paths = await adapter.getAudioPaths(fileHash);
      const decode = async (url: string): Promise<AudioBuffer> => {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Could not load audio: HTTP ${response.status}`);
        }
        return context.decodeAudioData(await response.arrayBuffer());
      };
      const [instrumental, vocals] = await Promise.all([
        decode(paths.instrumental),
        paths.vocals === null ? Promise.resolve(null) : decode(paths.vocals),
      ]);
      if (isCancelled() || finishedRef.current || !canCommit()) {
        return false;
      }
      applyReplayGainFromPaths(paths);
      const position = Math.min(getCurrentTime(), Math.max(0, instrumental.duration - 0.05));
      const wasPlaying = playingRef.current;
      stopSources();
      instrumentalBufRef.current = instrumental;
      vocalsBufRef.current = vocals;
      startOffsetRef.current = position;
      currentTimeRef.current = position;
      setGuideAvailable(vocals !== null);
      setDuration(instrumental.duration);
      if (wasPlaying) {
        startSources(position);
      }
      notifySubscribers(position);
      return true;
    },
    [
      adapter,
      applyReplayGainFromPaths,
      fileHash,
      getCurrentTime,
      notifySubscribers,
      startSources,
      stopSources,
    ],
  );

  const cleanup = useCallback(() => {
    cancelledRef.current = true;
    routerRef.current?.dispose();
    routerRef.current = null;

    cancelAnimationFrame(rafRef.current);

    stopSources();

    const context = ctxRef.current;
    if (context && context.state !== 'closed') {
      void context.close();
    }
    ctxRef.current = null;
  }, [stopSources]);

  return useMemo(
    () => ({
      getCurrentTime,
      subscribe,
      duration,
      isReady,
      isPlaying,
      isFinished,
      error,
      guideVolume,
      instrumentalVolume,
      guideAvailable,
      play,
      pause,
      resume,
      seek,
      setGuideVolume,
      setInstrumentalVolume,
      setMasterVolume,
      setReplayGainSettings,
      reloadBuffers,
      cleanup,
      getVocalsBuffer,
      getScoringBuffer,
      getAudioContext,
    }),
    [
      getCurrentTime,
      subscribe,
      duration,
      isReady,
      isPlaying,
      isFinished,
      error,
      guideVolume,
      instrumentalVolume,
      guideAvailable,
      play,
      pause,
      resume,
      seek,
      setGuideVolume,
      setInstrumentalVolume,
      setMasterVolume,
      setReplayGainSettings,
      reloadBuffers,
      cleanup,
      getVocalsBuffer,
      getScoringBuffer,
      getAudioContext,
    ],
  );
}
