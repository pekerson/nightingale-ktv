import { Button } from '@/shared/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/components/ui/table';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { CustomBackground } from '@/types/CustomBackground';

function sourceLabel(background: CustomBackground): string {
  return background.source.kind === 'url' ? 'Link' : 'Uploaded file';
}

export function BackgroundTable({
  backgrounds,
  busy,
  pendingRemoval,
  getFocusClassName,
  onRemove,
}: {
  backgrounds: readonly CustomBackground[];
  busy: boolean;
  pendingRemoval: string | null;
  getFocusClassName: (index: number) => string | undefined;
  onRemove: (id: string) => void;
}) {
  const { t } = useI18n();
  if (backgrounds.length === 0) {
    return (
      <div className="flex min-h-32 items-center justify-center rounded-lg border">
        <p className="text-sm text-muted-foreground">{t('No custom backgrounds yet.')}</p>
      </div>
    );
  }

  return (
    <div className="min-h-0 overflow-y-auto rounded-lg border">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow>
            <TableHead>{t('Name')}</TableHead>
            <TableHead>{t('Type')}</TableHead>
            <TableHead>{t('Source')}</TableHead>
            <TableHead className="text-right">{t('Action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {backgrounds.map((background, index) => (
            <TableRow key={background.id}>
              <TableCell className="max-w-64 truncate font-medium">{background.name}</TableCell>
              <TableCell className="capitalize">{t(background.background_type)}</TableCell>
              <TableCell>{t(sourceLabel(background))}</TableCell>
              <TableCell className="text-right">
                <Button
                  variant={pendingRemoval === background.id ? 'destructive' : 'outline'}
                  size="sm"
                  disabled={busy}
                  className={getFocusClassName(index)}
                  onClick={() => onRemove(background.id)}
                >
                  {pendingRemoval === background.id ? t('Confirm remove') : t('Remove')}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
