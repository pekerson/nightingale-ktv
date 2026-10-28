import { Spinner } from '@/shared/components/ui/spinner';

import { GENERIC_DESCRIPTION, type ViewParts, type FocusCtx } from '../parts';

export const installingView = (ctx: FocusCtx): ViewParts => {
  const { t } = ctx;
  return {
    description: GENERIC_DESCRIPTION,
    body: (
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner className="size-4" />
        <span>{t('Installing update… The app will restart shortly.')}</span>
      </p>
    ),
    footer: null,
  };
};
