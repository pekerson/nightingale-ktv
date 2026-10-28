import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { SidecarLrcKind } from '@/types/SidecarLrcKind';

type SidecarLrcNoticeProps = {
  fileName: string;
  kind: SidecarLrcKind;
  showing: boolean;
  canUse: boolean;
  onUse: () => void;
};

const extensionLabel = (kind: SidecarLrcKind): string => (kind === 'elrc' ? '.elrc' : '.lrc');

export const SidecarLrcNotice = ({
  fileName,
  kind,
  showing,
  canUse,
  onUse,
}: SidecarLrcNoticeProps) => {
  const { t } = useI18n();

  if (!showing && !canUse) {
    return null;
  }
  const ext = extensionLabel(kind);
  return (
    <output className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
      {showing ? (
        t('Loaded local sidecar {extension} from disk', { extension: ext })
      ) : (
        <>
          {t('Local')} {ext} {t('found next to the audio file.')}{' '}
          <Button
            variant="outline"
            size="xs"
            onClick={onUse}
            title={fileName}
            aria-label={t('Use local {extension} ({fileName})', { extension: ext, fileName })}
          >
            {t('Use local')} {ext}
          </Button>
        </>
      )}
    </output>
  );
};
