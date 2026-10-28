import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { alignLrcLyrics, applyTimedLyrics, provideLrc } from '@/bridge/lyrics';
import { useI18n } from '@/shared/i18n/use-i18n';
import { ANALYSIS_QUEUE, LYRICS, MENU, SONGS, SONGS_META } from '@/shared/query-keys';

const LYRICS_QUERY_KEYS = [LYRICS, MENU, SONGS, SONGS_META, ANALYSIS_QUEUE];

const invalidateLyricsQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  for (const key of LYRICS_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
};

export type ProvideLrcInput = {
  hash: string;
  lrcText: string;
  separateStems: boolean;
  title: string;
};

export const useProvideLrcMutation = () => {
  const { t } = useI18n();

  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash, lrcText, separateStems, title }: ProvideLrcInput) => {
      await provideLrc(hash, lrcText, separateStems);
      toast.info(
        separateStems
          ? t('Separating stems for "{title}"', { title })
          : t('Saved timed lyrics for "{title}"', { title }),
      );
    },
    onSuccess: () => invalidateLyricsQueries(queryClient),
    onError: (error: Error) => {
      toast.error(t('Error while providing lyrics: {error}', { error: error.message }));
    },
  });
};

export type ApplyTimedLyricsInput = {
  hash: string;
  lrcText: string;
  title: string;
};

export const useApplyTimedLyricsMutation = () => {
  const { t } = useI18n();

  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash, lrcText, title }: ApplyTimedLyricsInput) => {
      await applyTimedLyrics(hash, lrcText);
      toast.info(t('Applied timed lyrics to "{title}"', { title }));
    },
    onSuccess: () => invalidateLyricsQueries(queryClient),
    onError: (error: Error) => {
      toast.error(t('Error while applying timed lyrics: {error}', { error: error.message }));
    },
  });
};

export const useAlignLrcMutation = () => {
  const { t } = useI18n();

  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ hash, lrcText, title }: ApplyTimedLyricsInput) => {
      await alignLrcLyrics(hash, lrcText);
      toast.info(t('Aligning words within the line timing of "{title}"', { title }));
    },
    onSuccess: () => invalidateLyricsQueries(queryClient),
    onError: (error: Error) => {
      toast.error(t('Error while aligning timed lyrics: {error}', { error: error.message }));
    },
  });
};
