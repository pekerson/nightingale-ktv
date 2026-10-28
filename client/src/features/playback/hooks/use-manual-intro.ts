import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { toast } from 'sonner';

import {
  getSongIntroStart,
  onSongIntroStartChanged,
  songIntroQueryKey,
  songIntroSourceKey,
} from '@/bridge/song-intro';
import { manualIntroBoundary } from '@/shared/audio/intro-boundary';
import { useConfig } from '@/shared/config/use-config';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return String(error);
}

export function useManualIntro(
  fileHash: string,
  tempo: number,
  duration: number,
  leadSeconds: number,
) {
  const { t } = useI18n();
  const tRef = useLatestRef(t);
  const client = useQueryClient();
  const { data: config } = useConfig();
  const sourceKey = songIntroSourceKey(config?.library_source);
  const query = useQuery({
    queryKey: songIntroQueryKey(fileHash, sourceKey),
    queryFn: () => getSongIntroStart(fileHash),
    retry: false,
    enabled: config !== undefined,
  });
  const saved = query.isFetching || query.isError ? undefined : query.data;
  const start = saved?.start_sec ?? null;
  const boundary = manualIntroBoundary(start, tempo, duration, leadSeconds);
  const invalid = start !== null && boundary === null && duration > 0;

  useEffect(() => {
    if (invalid) {
      toast.error(
        tRef.current(
          'Saved singing start is outside this song. Using automatic detection; edit the saved value to correct it.',
        ),
      );
    }
  }, [invalid, tRef]);

  useEffect(() => {
    if (query.isError) {
      toast.error(
        tRef.current('Could not load singing start; using automatic detection: {error}', {
          error: errorMessage(query.error),
        }),
      );
    }
  }, [query.error, query.isError, tRef]);

  useEffect(() => {
    let cancelled = false;
    let stop: (() => void) | undefined;
    void onSongIntroStartChanged((hash) => {
      if (hash === fileHash) {
        void client.invalidateQueries({ queryKey: songIntroQueryKey(fileHash, sourceKey) });
      }
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          stop = unlisten;
          void client.invalidateQueries({ queryKey: songIntroQueryKey(fileHash, sourceKey) });
        }
        return undefined;
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          toast.error(
            tRef.current('Could not synchronize singing start: {error}', {
              error: errorMessage(error),
            }),
          );
        }
      });
    return () => {
      cancelled = true;
      stop?.();
    };
  }, [client, fileHash, sourceKey, tRef]);

  return { boundary, pending: query.isLoading || query.isFetching };
}
