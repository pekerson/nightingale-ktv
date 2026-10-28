import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import { applyAudioOutputRoutes, subscribeAudioOutputIssues } from '@/bridge/audio-outputs';
import { onConfigChanged } from '@/bridge/config';
import { updateMicMonitorGain } from '@/bridge/microphone';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import { CONFIG } from '@/shared/query-keys';

import { useConfig } from './use-config';
import { useInterfaceFont } from './use-interface-font';

export function useConfigSync() {
  const { data: config } = useConfig();
  useInterfaceFont(config?.app_font_size);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!config) {
      return;
    }
    applyAudioOutputRoutes(config.audio_outputs);
    updateMicMonitorGain(config.mic_monitor_gain ?? 1);
  }, [config]);
  const { t } = useI18n();
  const tRef = useLatestRef(t);

  useEffect(
    () =>
      subscribeAudioOutputIssues(() => {
        toast.error(
          tRef.current(
            'Selected speaker could not play audio. Check device connection and audio permissions, then refresh speakers.',
          ),
        );
      }),
    [tRef],
  );

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: CONFIG });
    };
    void onConfigChanged(refresh)
      .then((stop) => {
        if (cancelled) {
          stop();
          return undefined;
        }
        unlisten = stop;
        refresh();
        return undefined;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            tRef.current('Could not synchronize settings: {error}', {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queryClient, tRef]);
}
