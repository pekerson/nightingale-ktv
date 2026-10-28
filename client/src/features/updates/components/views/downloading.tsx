import prettyBytes from 'pretty-bytes';

import { Progress } from '@/shared/components/ui/progress';

import { GENERIC_DESCRIPTION, type ViewParts, type FocusCtx } from '../parts';

type Args = {
  ctx: FocusCtx;
  downloaded: number;
  contentLength: number | null;
  version: string;
};

export const downloadingView = ({ ctx, downloaded, contentLength, version }: Args): ViewParts => {
  const { t } = ctx;
  const percent =
    typeof contentLength === 'number' && contentLength !== 0 && contentLength > 0
      ? Math.min(100, Math.floor((downloaded / contentLength) * 100))
      : null;

  const sizeLabel =
    typeof contentLength === 'number' && contentLength !== 0
      ? t('{0} of {1}{2}', {
          '0': prettyBytes(downloaded),
          '1': prettyBytes(contentLength),
          '2': percent !== null ? ` (${percent}%)` : '',
        })
      : prettyBytes(downloaded);

  return {
    description: GENERIC_DESCRIPTION,
    body: (
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted-foreground">
          {t('Downloading')} {version}…
        </p>
        <Progress value={percent ?? 0} max={100} />
        <p className="text-xs text-muted-foreground">{sizeLabel}</p>
      </div>
    ),
    footer: null,
  };
};
