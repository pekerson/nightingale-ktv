import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { patchConfig } from '@/bridge/config';
import { useI18n } from '@/shared/i18n/use-i18n';
import { CONFIG } from '@/shared/query-keys';

export const useConfigMutation = () => {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: patchConfig,
    onSuccess: (savedConfig) => {
      queryClient.setQueryData(CONFIG, savedConfig);
      void queryClient.invalidateQueries({ queryKey: CONFIG });
    },
    onError: (error: Error) => {
      toast.error(t('Error updating the local config: {error}', { error: error.message }));
    },
  });
};
