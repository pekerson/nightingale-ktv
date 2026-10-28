import { useCallback } from 'react';

import { useClearCache } from '@/features/library/hooks/use-clear-cache';
import {
  useDialog,
  type ClearCacheTarget,
  type DialogMode,
} from '@/features/menu/hooks/use-dialog';
import { useDialogNav } from '@/features/menu/hooks/use-dialog-nav';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { useI18n } from '@/shared/i18n/use-i18n';
import { cn } from '@/shared/utils/cn';

const RING = 'ring-2 ring-primary';
const NO_FOCUS_RING = 'focus-visible:ring-0 focus-visible:border-transparent';

const clearCacheTarget = (mode: DialogMode): ClearCacheTarget | null => {
  if (typeof mode !== 'object' || mode === null || mode.mode !== 'clear-cache') {
    return null;
  }

  return mode.target;
};

const focusClass = (open: boolean, focusedIndex: number, index: number): string =>
  cn(NO_FOCUS_RING, open && focusedIndex === index && RING);

const COPY: Record<ClearCacheTarget, { title: string; description: string; action: string }> = {
  all: {
    title: 'Clear models and trim background videos?',
    description:
      'This deletes cached analysis models and extra background videos, keeping one video in each background category. Models download again when needed. Song analysis caches and song MV videos are unaffected.',
    action: 'Clean up caches',
  },
  videos: {
    title: 'Trim background video cache?',
    description:
      'This removes extra cached background videos while keeping one of each category. Removed videos can be downloaded again when needed. Song MV videos are unaffected.',
    action: 'Trim extra videos',
  },
  models: {
    title: 'Clear models cache?',
    description:
      'This will permanently delete the cached analysis models. They will be re-downloaded the next time analysis runs.',
    action: 'Clear cache',
  },
};

export const ClearCacheDialog = () => {
  const { t } = useI18n();

  const { close, mode } = useDialog();
  const clearCache = useClearCache();

  const target = clearCacheTarget(mode);
  const open = target !== null;

  const runClear = useCallback(() => {
    if (!target) {
      return;
    }
    void clearCache[target]();
    close();
  }, [target, clearCache, close]);

  const onConfirm = useCallback(
    (index: number) => {
      if (index === 0) {
        close();
      } else {
        runClear();
      }
    },
    [close, runClear],
  );

  const { focusedIndex } = useDialogNav({
    open,
    itemCount: 2,
    onConfirm,
    onBack: close,
  });

  const copy = target ? COPY[target] : null;

  return (
    <AlertDialog open={open} onOpenChange={close}>
      <AlertDialogContent onEscapeKeyDown={(e) => e.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{t(copy?.title ?? 'Clear cache?')}</AlertDialogTitle>
          <AlertDialogDescription>{t(copy?.description ?? '')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={close} className={focusClass(open, focusedIndex, 0)}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={runClear}
            className={focusClass(open, focusedIndex, 1)}
          >
            {t(copy?.action ?? 'Clear cache')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
