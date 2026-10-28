import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { clearAll, clearModels, clearVideos } from '@/bridge/cache';
import { useI18n } from '@/shared/i18n/use-i18n';
import { CACHE_STATS } from '@/shared/query-keys';

export const useClearCache = () => {
  const { t } = useI18n();

  const queryClient = useQueryClient();

  const clearCacheFactory = (handler: () => Promise<void>) => {
    return async () => {
      try {
        await handler();

        void queryClient.invalidateQueries({ queryKey: CACHE_STATS });

        toast.info(t('Cache cleanup complete'));
      } catch (error: unknown) {
        toast.error(
          t('Error while deleting cache: {error}', {
            error: error instanceof Error ? error.message : t('unknown error'),
          }),
        );
      }
    };
  };

  return {
    videos: clearCacheFactory(clearVideos),
    models: clearCacheFactory(clearModels),
    all: clearCacheFactory(clearAll),
  };
};
