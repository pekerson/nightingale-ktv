import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { patchConfig } from '@/bridge/config';
import { isSessionPlayback } from '@/bridge/playback-session';
import { closePlaybackWindow } from '@/bridge/window';
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/i18n/use-i18n';
import { CONFIG } from '@/shared/query-keys';
import type { Song } from '@/types/Song';

import { LoadingScreen } from './loading-screen';

export function PlaybackVolumeGate({ song, children }: { song: Song; children: ReactNode }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { mutate, isSuccess, isError, error } = useMutation({
    mutationFn: () => patchConfig({ instrumental_volume: 1, guide_volume: 1, mic_monitor_gain: 1 }),
    onSuccess: async (saved) => {
      queryClient.setQueryData(CONFIG, saved);
      await queryClient.invalidateQueries({ queryKey: CONFIG });
    },
  });
  useEffect(() => {
    mutate();
  }, [mutate]);

  const exit = () => {
    if (isSessionPlayback()) {
      void closePlaybackWindow().catch((failure: unknown) => toast.error(String(failure)));
    } else {
      void navigate('/', { replace: true });
    }
  };
  if (isSuccess) {
    return children;
  }
  if (isError) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
        <p role="alert">
          {t('Could not prepare playback volume: {error}', {
            error: error instanceof Error ? error.message : String(error),
          })}
        </p>
        <div className="flex gap-2">
          <Button onClick={() => mutate()}>{t('Retry')}</Button>
          <Button variant="outline" onClick={exit}>
            {t('Back to Menu')}
          </Button>
        </div>
      </div>
    );
  }
  return <LoadingScreen song={song} />;
}
