import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { toast } from 'sonner';

import {
  addPlaybackQueueEntry,
  clearPlaybackQueue,
  loadPlaybackQueue,
  movePlaybackQueueEntry,
  onPlaybackQueueChanged,
  removePlaybackQueueEntry,
  type PlaybackQueueEntry,
} from '@/bridge/playback-queue';
import type { PlaybackPlayer, PlaybackTarget } from '@/bridge/playback-session';
import { usePlaybackLauncher } from '@/features/playback/hooks/use-playback-launcher';
import {
  preparePlayback,
  type PreparePlaybackInput,
} from '@/features/playback/mutations/use-prepare-playback-mutation';
import { useI18n } from '@/shared/i18n/use-i18n';
import { PLAYBACK_QUEUE } from '@/shared/query-keys';

export function usePlaybackQueueQuery() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: PLAYBACK_QUEUE, queryFn: loadPlaybackQueue });

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void onPlaybackQueueChanged((entries) => {
      queryClient.setQueryData(PLAYBACK_QUEUE, entries);
    }).then((stop) => {
      if (cancelled) {
        stop();
        return undefined;
      }
      unlisten = stop;
      void queryClient.invalidateQueries({ queryKey: PLAYBACK_QUEUE });
      return undefined;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [queryClient]);

  return query;
}

export function useAddPlaybackQueueEntry() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ song, tempo, keyOffset }: PreparePlaybackInput) =>
      addPlaybackQueueEntry(song.file_hash, tempo, keyOffset),
    onSuccess: (entries) => queryClient.setQueryData(PLAYBACK_QUEUE, entries),
    onError: (error: Error) =>
      toast.error(t('Could not add song to queue: {error}', { error: error.message })),
  });
}

export function useMovePlaybackQueueEntry() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, targetIndex }: { id: string; targetIndex: number }) =>
      movePlaybackQueueEntry(id, targetIndex),
    onMutate: async ({ id, targetIndex }) => {
      await queryClient.cancelQueries({ queryKey: PLAYBACK_QUEUE });
      const previous = queryClient.getQueryData<PlaybackQueueEntry[]>(PLAYBACK_QUEUE);
      if (previous !== undefined) {
        const entries = [...previous];
        const sourceIndex = entries.findIndex((entry) => entry.id === id);
        if (sourceIndex >= 0) {
          const [entry] = entries.splice(sourceIndex, 1);
          entries.splice(targetIndex, 0, entry);
          queryClient.setQueryData(PLAYBACK_QUEUE, entries);
        }
      }
      return { previous };
    },
    onSuccess: (entries) => queryClient.setQueryData(PLAYBACK_QUEUE, entries),
    onError: (error: Error, _input, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(PLAYBACK_QUEUE, context.previous);
      }
      toast.error(t('Could not reorder queue: {error}', { error: error.message }));
    },
  });
}

export function useRemovePlaybackQueueEntry() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removePlaybackQueueEntry,
    onSuccess: (entries) => queryClient.setQueryData(PLAYBACK_QUEUE, entries),
    onError: (error: Error) =>
      toast.error(t('Could not remove song from queue: {error}', { error: error.message })),
  });
}

export function useClearPlaybackQueue() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearPlaybackQueue,
    onSuccess: (entries) => queryClient.setQueryData(PLAYBACK_QUEUE, entries),
    onError: (error: Error) =>
      toast.error(t('Could not clear queue: {error}', { error: error.message })),
  });
}

type StartInput = {
  entry: PlaybackQueueEntry;
  target: PlaybackTarget;
  players: PlaybackPlayer[];
};

type StartResult = {
  entries: PlaybackQueueEntry[];
};

export function useStartNextPlaybackQueueSong(entries: PlaybackQueueEntry[]) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { launch, reserveTarget } = usePlaybackLauncher();
  const { mutate, isLoading, isError } = useMutation({
    mutationFn: async ({ entry, target, players }: StartInput): Promise<StartResult> => {
      const song = await preparePlayback({
        song: entry.song,
        tempo: entry.tempo,
        keyOffset: entry.keyOffset,
      });
      await launch(
        {
          song,
          queuePlayback: true,
          playbackId: entry.id,
          players: players.length > 0 ? players : undefined,
        },
        target,
      );
      const nextEntries = await removePlaybackQueueEntry(entry.id);
      return { entries: nextEntries };
    },
    onSuccess: ({ entries: nextEntries }) => {
      queryClient.setQueryData(PLAYBACK_QUEUE, nextEntries);
    },
    onError: (error: Error, { target }) => {
      target?.close();
      toast.error(t('Could not start queued song: {error}', { error: error.message }));
    },
  });

  const playNext = useCallback(
    (players: PlaybackPlayer[] = []) => {
      if (entries.length === 0 || isLoading) {
        return false;
      }
      const target = reserveTarget();
      if (target === undefined) {
        return false;
      }
      mutate({ entry: entries[0], target, players });
      return true;
    },
    [entries, isLoading, mutate, reserveTarget],
  );

  return { playNext, isPreparing: isLoading, hasError: isError };
}
