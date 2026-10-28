import { useCallback } from 'react';

import type { LibrarySelection } from '@/features/library/hooks/use-library-selection';
import { useSelectionActions } from '@/features/library/hooks/use-selection-actions';
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
import { Button } from '@/shared/components/ui/button';
import { useI18n } from '@/shared/i18n/use-i18n';

function SelectedCacheDialog({ actions }: { actions: ReturnType<typeof useSelectionActions> }) {
  const { t } = useI18n();
  const confirm = useCallback(
    (index: number) => {
      if (actions.busy) {
        return;
      }
      if (index === 0) {
        actions.closeDelete();
      } else {
        actions.run('delete');
      }
    },
    [actions],
  );
  useDialogNav({
    open: actions.deleteOpen,
    itemCount: 2,
    onConfirm: confirm,
    onBack: actions.closeDelete,
  });
  return (
    <AlertDialog
      open={actions.deleteOpen}
      onOpenChange={(open) => {
        if (!open && !actions.busy) {
          actions.closeDelete();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('Delete cache for {count} selected songs?', { count: actions.deleteCount })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              'Only the selected song caches will be deleted. Original music files will be kept. Shared audio is counted once.',
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={actions.busy} onClick={actions.closeDelete}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={actions.busy || actions.deleteCount === 0}
            onClick={(event) => {
              event.preventDefault();
              actions.run('delete');
            }}
          >
            {t('Delete cache')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function LibrarySelectionToolbar({
  selection,
  loadedCount,
  totalCount,
  onExit,
}: {
  selection: LibrarySelection;
  loadedCount: number;
  totalCount: number;
  onExit: () => void;
}) {
  const { t } = useI18n();
  const actions = useSelectionActions(selection);
  const busy = selection.busy || actions.busy;
  if (!selection.active) {
    return null;
  }
  return (
    <div
      data-nav-passthrough
      className="flex flex-wrap items-center gap-2 rounded-md border p-2"
      aria-label={t('Song selection')}
    >
      <output className="text-sm">
        {t('Selected {count} songs', { count: selection.keys.size })}
      </output>
      <Button size="sm" variant="outline" disabled={busy} onClick={selection.selectLoaded}>
        {t('Select loaded songs ({count})', { count: loadedCount })}
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={selection.selectAll}>
        {t('Select all matching songs ({count})', { count: totalCount })}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={selection.clear}>
        {t('Clear selection')}
      </Button>
      <Button size="sm" variant="ghost" disabled={busy} onClick={onExit}>
        {t('Done selecting')}
      </Button>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={busy || selection.keys.size === 0}
          onClick={() => actions.run('analyze')}
        >
          {t('Analyze selected')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || selection.keys.size === 0}
          onClick={() => actions.run('cancel')}
        >
          {t('Cancel selected analysis')}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy || selection.keys.size === 0}
          onClick={actions.prepareDelete}
        >
          {t('Delete selected cache')}
        </Button>
      </div>
      <p className="w-full text-xs text-muted-foreground">
        {t(
          selection.busy
            ? 'Loading all matching songs…'
            : 'Selection is limited to the current list, search, and filters. New matches are not selected automatically.',
        )}
      </p>
      <SelectedCacheDialog actions={actions} />
    </div>
  );
}
