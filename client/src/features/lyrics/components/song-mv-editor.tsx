import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { open } from '@tauri-apps/plugin-dialog';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { isTauri } from '@/bridge/runtime';
import { songIntroSourceKey } from '@/bridge/song-intro';
import {
  getSongMv,
  setSongMv,
  setSongMvEnabled,
  setSongMvOffset,
  type SongMv,
} from '@/bridge/song-mv';
import { useDialog } from '@/features/menu/hooks/use-dialog';
import { useDialogNav } from '@/features/menu/hooks/use-dialog-nav';
import { Button } from '@/shared/components/ui/button';
import { ButtonGroup } from '@/shared/components/ui/button-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { Song } from '@/types/Song';

const MV_FILTER = {
  name: 'MV videos',
  extensions: ['mp4', 'mkv', 'avi', 'webm', 'mov', 'm4v'],
};

function mvSourceLabel(data: SongMv | undefined): string {
  if (!data) {
    return 'Loading MV selection…';
  }
  if (data.manual_path !== null) {
    return 'Manually selected MV';
  }
  if (data.automatic_path !== null) {
    return 'Automatically matched MV';
  }
  return 'No MV selected';
}

function canSaveMvPath({
  busy,
  draft,
  scope,
  value,
  storedPath,
}: {
  busy: boolean;
  draft: { scope: string; path: string } | null;
  scope: string;
  value: string;
  storedPath: string;
}): boolean {
  return !busy && draft?.scope === scope && value.trim() !== '' && value.trim() !== storedPath;
}

function useSongMvEditor(song: Song) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const scope = `${songIntroSourceKey(config?.library_source)}:${song.file_hash}`;
  const queryKey = ['song-mv', scope];
  const [draft, setDraft] = useState<{ scope: string; path: string } | null>(null);
  const [offsetDraft, setOffsetDraft] = useState<{
    scope: string;
    sign: 1 | -1;
    seconds: string;
    milliseconds: string;
  } | null>(null);
  const query = useQuery({
    queryKey,
    queryFn: () => getSongMv(song.file_hash),
    enabled: config !== undefined,
  });
  const pathMutation = useMutation({
    mutationFn: (path: string | null) => setSongMv(song.file_hash, path),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      setDraft(null);
      toast.success(t('MV selection saved'));
    },
    onError: (error: Error) =>
      toast.error(t('Could not save MV: {error}', { error: error.message })),
  });
  const enabledMutation = useMutation({
    mutationFn: (enabled: boolean) => setSongMvEnabled(song.file_hash, enabled),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      toast.success(t('MV display setting saved'));
    },
    onError: (error: Error) =>
      toast.error(t('Could not update MV display: {error}', { error: error.message })),
  });
  const offsetMutation = useMutation({
    mutationFn: (offsetMs: number) => setSongMvOffset(song.file_hash, offsetMs),
    onSuccess: (result) => {
      queryClient.setQueryData(queryKey, result);
      setOffsetDraft(null);
      toast.success(t('MV timing saved'));
    },
    onError: (error: Error) =>
      toast.error(t('Could not save MV timing: {error}', { error: error.message })),
  });
  const storedPath = query.data?.effective_path ?? '';
  const value = draft?.scope === scope ? draft.path : storedPath;
  const setPath = (path: string) => setDraft({ scope, path });
  const busy = [
    config === undefined,
    query.isLoading,
    query.isError,
    pathMutation.isLoading,
    enabledMutation.isLoading,
    offsetMutation.isLoading,
  ].some(Boolean);
  const canSavePath = canSaveMvPath({ busy, draft, scope, value, storedPath });
  const canRestore = !busy && query.data !== undefined && query.data.manual_path !== null;
  const choose = async () => {
    try {
      const selected = await open({ multiple: false, filters: [MV_FILTER] });
      if (typeof selected === 'string') {
        setPath(selected);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Could not choose MV file'));
    }
  };
  const storedOffset = query.data?.offset_ms ?? 0;
  const offset =
    offsetDraft?.scope === scope
      ? offsetDraft
      : {
          scope,
          sign: storedOffset < 0 ? (-1 as const) : (1 as const),
          seconds: String(Math.floor(Math.abs(storedOffset) / 1000)),
          milliseconds: String(Math.abs(storedOffset) % 1000),
        };
  const seconds = Number(offset.seconds);
  const milliseconds = Number(offset.milliseconds);
  const validOffset =
    /^\d+$/.test(offset.seconds) &&
    /^\d+$/.test(offset.milliseconds) &&
    Number.isInteger(seconds) &&
    seconds <= 1000 &&
    Number.isInteger(milliseconds) &&
    milliseconds <= 1000;
  const offsetMs = offset.sign * (seconds * 1000 + milliseconds);
  const setOffset = (change: Partial<typeof offset>) => setOffsetDraft({ ...offset, ...change });
  return {
    offset,
    setOffset,
    validOffset,
    canSaveOffset:
      !busy && offsetDraft?.scope === scope && validOffset && offsetMs !== storedOffset,
    saveOffset: () => offsetMutation.mutate(offsetMs),
    value,
    setPath,
    choose,
    busy,
    canSavePath,
    canRestore,
    query,
    pathMutation,
    enabledMutation,
  };
}

type MvEditorState = ReturnType<typeof useSongMvEditor>;

function MvPathField({ state }: { state: MvEditorState }) {
  const { t } = useI18n();
  const currentPath = state.query.data?.effective_path;
  return (
    <div className="space-y-2">
      <label htmlFor="song-mv-path" className="block text-sm font-medium">
        {t('MV video path')}
      </label>
      <div className="flex flex-wrap gap-2">
        <Input
          id="song-mv-path"
          aria-label={t('MV video path')}
          value={state.value}
          onChange={(event) => state.setPath(event.target.value)}
          readOnly={state.busy}
          placeholder={t('MV video path')}
          className="min-w-40 flex-1"
        />
        {isTauri && (
          <Button type="button" variant="outline" onClick={() => void state.choose()}>
            {t('Choose MV file')}
          </Button>
        )}
      </div>
      <p className="break-all text-xs text-muted-foreground">
        {t(state.query.isError ? 'MV selection unavailable' : mvSourceLabel(state.query.data))}
      </p>
      {typeof currentPath === 'string' && currentPath !== '' && (
        <p className="break-all text-xs text-muted-foreground">
          {t('Current MV: {path}', { path: currentPath })}
        </p>
      )}
      {state.query.data?.manual_path === null && state.query.data.automatic_path !== null && (
        <p className="text-xs text-muted-foreground">
          {t('Saving a path here will replace automatic matching for this song.')}
        </p>
      )}
      {state.query.isError && (
        <p role="alert" className="text-xs text-destructive">
          {t('Could not load the MV selection.')}
        </p>
      )}
    </div>
  );
}

function MvEnabledField({ state }: { state: MvEditorState }) {
  const { t } = useI18n();
  const enabled = state.query.data?.enabled ?? true;
  const change = (next: boolean) => {
    if (!state.busy && next !== enabled) {
      state.enabledMutation.mutate(next);
    }
  };
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('Enable MV for this song')}</p>
      <ButtonGroup aria-label={t('Enable MV for this song')}>
        <Button
          type="button"
          variant={!enabled ? 'default' : 'outline'}
          aria-pressed={!enabled}
          aria-disabled={state.busy}
          onClick={() => change(false)}
        >
          {t('Off')}
        </Button>
        <Button
          type="button"
          variant={enabled ? 'default' : 'outline'}
          aria-pressed={enabled}
          aria-disabled={state.busy}
          onClick={() => change(true)}
        >
          {t('On')}
        </Button>
      </ButtonGroup>
      {!enabled && (
        <p className="text-xs text-muted-foreground">
          {t('MV is off; the selected file path is kept.')}
        </p>
      )}
    </div>
  );
}

function MvOffsetField({ state }: { state: MvEditorState }) {
  const { t } = useI18n();
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{t('MV timing offset')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>{t('Direction')}</span>
          <select
            aria-label={t('Direction')}
            value={state.offset.sign}
            disabled={state.busy}
            onChange={(event) => state.setOffset({ sign: Number(event.target.value) as 1 | -1 })}
            className="h-9 rounded-md border bg-background px-2 text-foreground"
          >
            <option value={1}>+</option>
            <option value={-1}>−</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>{t('Seconds')}</span>
          <Input
            aria-label={t('MV offset seconds')}
            inputMode="numeric"
            value={state.offset.seconds}
            onChange={(event) => state.setOffset({ seconds: event.target.value })}
            readOnly={state.busy}
            aria-invalid={!state.validOffset}
            className="w-20 text-center font-mono"
          />
        </label>
        <span aria-hidden="true" className="pb-1">
          .
        </span>
        <label className="space-y-1 text-xs text-muted-foreground">
          <span>{t('Milliseconds')}</span>
          <Input
            aria-label={t('MV offset milliseconds')}
            inputMode="numeric"
            value={state.offset.milliseconds}
            onChange={(event) => state.setOffset({ milliseconds: event.target.value })}
            readOnly={state.busy}
            aria-invalid={!state.validOffset}
            className="w-20 text-center font-mono"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!state.canSaveOffset}
          onClick={state.saveOffset}
        >
          {t('Save MV timing')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {t('Plus skips the beginning of the MV; minus shows a black screen before the MV starts.')}
      </p>
      {!state.validOffset && (
        <p role="alert" className="text-xs text-destructive">
          {t('Seconds and milliseconds must each be integers from 0 to 1000.')}
        </p>
      )}
    </div>
  );
}

function SongMvDialogContent({ song, onClose }: { song: Song; onClose: () => void }) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const state = useSongMvEditor(song);
  useDialogNav({
    open: true,
    itemCount: isTauri ? 11 : 10,
    onBack: onClose,
    containerRef,
  });
  return (
    <div ref={containerRef} data-nav-passthrough className="space-y-4">
      <MvPathField state={state} />
      <MvEnabledField state={state} />
      <MvOffsetField state={state} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          aria-disabled={!state.canSavePath}
          onClick={() => {
            if (state.canSavePath) {
              state.pathMutation.mutate(state.value.trim());
            }
          }}
        >
          {t('Save MV')}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-disabled={!state.canRestore}
          onClick={() => {
            if (state.canRestore) {
              state.pathMutation.mutate(null);
            }
          }}
        >
          {t('Restore automatic MV')}
        </Button>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Close')}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function SongMvDialog() {
  const { t } = useI18n();
  const { mode, close } = useDialog();
  const song =
    mode !== null && typeof mode === 'object' && mode.mode === 'edit-mv' ? mode.song : null;
  return (
    <Dialog
      open={song !== null}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      {song && (
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{t('Edit MV')}</DialogTitle>
            <DialogDescription>
              {t('The MV plays silently; this song supplies the audio.')}
            </DialogDescription>
          </DialogHeader>
          <SongMvDialogContent key={song.file_hash} song={song} onClose={close} />
        </DialogContent>
      )}
    </Dialog>
  );
}
