import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { ReferencePitchTimeline } from '@/features/playback/lib/pitch/reference-timeline';
import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers/playback-transport-context';

type PitchClock = { time: number; buffer: AudioBuffer | null };

export function usePitchTimeline(windowSeconds: number) {
  const { isReady } = usePlaybackTransportState();
  const { subscribe, subscribeSeek, getCurrentTime, getScoringBuffer } =
    usePlaybackTransportActions();
  const [clock, setClock] = useState<PitchClock>(() => ({
    time: getCurrentTime(),
    buffer: getScoringBuffer(),
  }));
  const timeline = useMemo(
    () => (clock.buffer === null ? null : new ReferencePitchTimeline(clock.buffer)),
    [clock.buffer],
  );
  const subscribeReference = useCallback(
    (listener: () => void) => timeline?.subscribe(listener) ?? (() => {}),
    [timeline],
  );
  const getVersion = useCallback(() => timeline?.getVersion() ?? 0, [timeline]);
  useSyncExternalStore(subscribeReference, getVersion, getVersion);

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }
    let frame = 0;
    const update = (time: number) => {
      const buffer = getScoringBuffer();
      setClock((previous) =>
        previous.time === time && previous.buffer === buffer ? previous : { time, buffer },
      );
    };
    update(getCurrentTime());
    const unsubscribe = subscribe(update);
    const unsubscribeSeek = subscribeSeek((time) => {
      update(time);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => update(getCurrentTime()));
    });
    return () => {
      unsubscribe();
      unsubscribeSeek();
      cancelAnimationFrame(frame);
    };
  }, [getCurrentTime, getScoringBuffer, isReady, subscribe, subscribeSeek]);

  useEffect(() => {
    timeline?.request(clock.time - windowSeconds / 2, clock.time + windowSeconds / 2);
  }, [timeline, clock.time, windowSeconds]);

  const reference =
    timeline?.read(clock.time - windowSeconds / 2, clock.time + windowSeconds / 2) ?? [];

  return { currentTime: clock.time, reference, isReady };
}
