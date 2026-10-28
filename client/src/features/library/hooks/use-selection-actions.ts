import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { cancelAnalysis, deleteSongCache, enqueue, songsByHashes } from '@/bridge/analysis';
import { useI18n } from '@/shared/i18n/use-i18n';
import { ANALYSIS_QUEUE, CACHE_STATS, MENU, SONGS, SONGS_META } from '@/shared/query-keys';
import type { Song } from '@/types/Song';

import { songKey } from '../components/song/song-key';
import type { LibrarySelection } from './use-library-selection';

type Action = 'analyze' | 'cancel' | 'delete';
const uniqueHashes = (songs: readonly Song[]) => [...new Set(songs.map((song) => song.file_hash))];
const ACTION_LABEL = {
  analyze: 'Selected analysis queued: {count}',
  cancel: 'Selected analysis cancelled: {count}',
  delete: 'Selected song caches deleted: {count}',
};

export function useSelectionActions(selection: LibrarySelection) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<Song[] | null>(null);
  const failure = (error: Error) =>
    toast.error(t('Could not process selection: {error}', { error: t(error.message) }));
  const prepare = useMutation({
    mutationFn: () => selection.resolve(),
    onSuccess: (songs) => setDeleting(songs),
    onError: failure,
  });
  const execute = useMutation({
    mutationFn: async (action: Action) => {
      const keys = action === 'delete' ? new Set((deleting ?? []).map(songKey)) : undefined;
      const current = await selection.resolve(keys);
      const eligible = action === 'analyze' ? current.filter((song) => !song.is_analyzed) : current;
      const hashes = uniqueHashes(eligible);
      if (action === 'delete' && hashes.length !== uniqueHashes(deleting ?? []).length) {
        setDeleting(current);
        toast.info(t('The selection changed. Review the updated count and confirm again.'));
        return null;
      }
      const handlers = { analyze: enqueue, cancel: cancelAnalysis, delete: deleteSongCache };
      const count = hashes.length === 0 ? 0 : await handlers[action](songsByHashes(hashes));
      return { action, count };
    },
    onSuccess: async (result) => {
      if (result === null) {
        return;
      }
      setDeleting(null);
      if (result.action === 'delete') {
        selection.clear();
      }
      toast.success(t(ACTION_LABEL[result.action], { count: result.count }));
      await Promise.all(
        [ANALYSIS_QUEUE, CACHE_STATS, MENU, SONGS, SONGS_META].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onError: failure,
  });
  return {
    busy: prepare.isPending || execute.isPending,
    deleteOpen: deleting !== null,
    deleteCount: uniqueHashes(deleting ?? []).length,
    closeDelete: () => setDeleting(null),
    prepareDelete: () => prepare.mutate(),
    run: (action: Action) => execute.mutate(action),
  };
}
