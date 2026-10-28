/**
 * Keeps a ref to the latest app config so partial updates can be persisted
 * without listing `config` in callback dependency arrays.
 */

import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { toast } from 'sonner';

import { patchConfig } from '@/bridge/config';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import { CONFIG } from '@/shared/query-keys';
import type { AppConfig } from '@/types/AppConfig';

export function usePlaybackConfigPersist(config: AppConfig | null) {
  const queryClient = useQueryClient();
  const configRef = useLatestRef(config);
  const { t } = useI18n();
  const tRef = useLatestRef(t);

  const persistConfig = useCallback(
    (patch: Partial<AppConfig>) => {
      const current = configRef.current;
      if (!current) {
        return;
      }

      void patchConfig(patch)
        .then((savedConfig) => queryClient.setQueryData(CONFIG, savedConfig))
        .catch((error: unknown) => {
          toast.error(
            tRef.current('Could not save playback settings: {error}', {
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        });
    },
    [configRef, queryClient, tRef],
  );

  return persistConfig;
}
