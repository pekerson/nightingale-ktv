import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers/playback-transport-context';
import { analyzeIntroVocals, type VocalRegion } from '@/shared/audio/intro-boundary';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';

type Detection = { regions: VocalRegion[]; pending: boolean; hasVocals: boolean };

export function useIntroVocals(): Detection {
  const { t } = useI18n();
  const tRef = useLatestRef(t);
  const { isReady } = usePlaybackTransportState();
  const { getVocalsBuffer, subscribeSeek } = usePlaybackTransportActions();
  const [detection, setDetection] = useState<Detection>({
    regions: [],
    pending: false,
    hasVocals: false,
  });

  useEffect(() => {
    if (!isReady) {
      return undefined;
    }
    let active = true;
    let generation = 0;
    let current: AudioBuffer | null | undefined;
    const refresh = () => {
      const buffer = getVocalsBuffer();
      if (buffer === current) {
        return;
      }
      current = buffer;
      const version = ++generation;
      setDetection({ regions: [], pending: buffer !== null, hasVocals: buffer !== null });
      if (buffer === null) {
        return;
      }
      void analyzeIntroVocals(buffer)
        .then((regions) => {
          if (active && generation === version) {
            setDetection({ regions, pending: false, hasVocals: true });
          }
          return undefined;
        })
        .catch((error: unknown) => {
          if (active && generation === version) {
            current = undefined;
            setDetection({ regions: [], pending: false, hasVocals: true });
            toast.error(
              tRef.current('Could not inspect vocal timing; using lyrics: {error}', {
                error: error instanceof Error ? error.message : String(error),
              }),
            );
          }
        });
    };
    refresh();
    const stop = subscribeSeek(refresh);
    return () => {
      active = false;
      stop();
    };
  }, [isReady, getVocalsBuffer, subscribeSeek, tRef]);
  return detection;
}
