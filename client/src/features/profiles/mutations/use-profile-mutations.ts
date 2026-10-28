import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { createProfile, deleteProfile, switchProfile } from '@/bridge/profile';
import { useI18n } from '@/shared/i18n/use-i18n';
import { PROFILES } from '@/shared/query-keys';

export const useProfileMutations = () => {
  const { t } = useI18n();

  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      name,
      type: action,
    }: {
      name: string;
      type: 'create' | 'switch' | 'delete';
    }) => {
      switch (action) {
        case 'create':
          return createProfile(name);
        case 'switch':
          return switchProfile(name);
        case 'delete':
          return deleteProfile(name);
      }
      action satisfies never;
      throw new Error('Unknown profile mutation');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: PROFILES });
    },
    onError: (error: Error) => {
      toast.error(t('Error updating profiles: {error}', { error: error.message }));
    },
  });
};
