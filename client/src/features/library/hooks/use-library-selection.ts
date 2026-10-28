import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { loadSongs } from '@/bridge/songs';
import { songKey } from '@/features/library/components/song/song-key';
import { useLibraryFilter } from '@/features/menu/hooks/use-library-filter';
import { useSearch } from '@/features/menu/hooks/use-search';
import { useConfig } from '@/shared/config/use-config';
import { useLatestRef } from '@/shared/hooks/use-latest-ref';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { LibraryMenuFilters } from '@/types/LibraryMenuFilters';
import type { LibrarySource } from '@/types/LibrarySource';
import type { Song } from '@/types/Song';

function sourceScope(source: LibrarySource | null | undefined): unknown {
  if (!source) {
    return null;
  }
  switch (source.kind) {
    case 'folder':
      return [source.kind, source.path];
    case 'navidrome':
      return [source.kind, source.base_url, source.username];
    case 'jellyfin':
      return [source.kind, source.base_url, source.user_id, source.library_ids];
    case 'plex':
      return [source.kind, source.base_url, source.machine_id, source.username, source.section_ids];
    default:
      return null;
  }
}

async function readResultSongs(
  filters: LibraryMenuFilters,
  current: () => boolean,
): Promise<Song[]> {
  const result = new Map<string, Song>();
  const readPage = async (skip: number, total?: number): Promise<Song[]> => {
    if (!current()) {
      throw new Error('Selection scope changed. Select songs again.');
    }
    const page = await loadSongs({ filters, search: null, sort: null, skip, take: 250 });
    if (!current()) {
      throw new Error('Selection scope changed. Select songs again.');
    }
    if (total !== undefined && total !== page.processed_count) {
      throw new Error('The song list changed while loading. Please try again.');
    }
    page.processed.forEach((song) => result.set(songKey(song), song));
    const next = skip + page.processed.length;
    if (next >= page.processed_count) {
      return [...result.values()];
    }
    if (page.processed.length === 0) {
      throw new Error('The song list changed while loading. Please try again.');
    }
    return readPage(next, page.processed_count);
  };
  return readPage(0);
}

export function useSelectionScope() {
  const { artist, album, playlist, folder, query, status, transcript_source } = useLibraryFilter();
  const { search } = useSearch();
  const { data: config } = useConfig();
  const filters: LibraryMenuFilters = {
    artist: artist ?? null,
    album: album ?? null,
    playlist: playlist ?? null,
    folder,
    query: query ?? null,
    status: status ?? null,
    transcript_source: transcript_source ?? null,
    search: search || null,
  };
  return { filters, scope: JSON.stringify([filters, sourceScope(config?.library_source)]) };
}

export function useLibrarySelection(loaded: readonly Song[]) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { filters, scope } = useSelectionScope();
  const scopeRef = useLatestRef(scope);
  const epochRef = useRef(0);
  const [state, setState] = useState({ scope, active: false, keys: new Set<string>() });
  const active = state.scope === scope && state.active;
  const keys = useMemo(
    () => (state.scope === scope ? state.keys : new Set<string>()),
    [scope, state],
  );
  const keysRef = useLatestRef(keys);
  useEffect(
    () => () => {
      epochRef.current += 1;
    },
    [],
  );

  const readCurrent = async () => {
    const epoch = epochRef.current;
    return queryClient.fetchQuery({
      queryKey: ['library-selection-snapshot', scope],
      queryFn: () =>
        readResultSongs(filters, () => scopeRef.current === scope && epochRef.current === epoch),
      staleTime: 0,
    });
  };
  const selectAll = useMutation({
    mutationFn: ({
      requestScope,
      epoch,
      requestFilters,
    }: {
      requestScope: string;
      epoch: number;
      requestFilters: LibraryMenuFilters;
    }) =>
      readResultSongs(
        requestFilters,
        () => scopeRef.current === requestScope && epochRef.current === epoch,
      ),
    onSuccess: (songs, { requestScope, epoch }) => {
      if (scopeRef.current === requestScope && epochRef.current === epoch) {
        setState({ scope: requestScope, active: true, keys: new Set(songs.map(songKey)) });
      }
    },
    onError: (error: Error) => toast.error(t(error.message)),
  });
  const toggle = useCallback(
    (song: Song) => {
      if (selectAll.isPending) {
        return;
      }
      setState((previous) => {
        const next = new Set(previous.scope === scope ? previous.keys : []);
        const key = songKey(song);
        if (!next.delete(key)) {
          next.add(key);
        }
        return { scope, active: true, keys: next };
      });
    },
    [scope, selectAll.isPending],
  );
  const clear = () => setState({ scope, active: true, keys: new Set() });
  const resolve = async (requested?: ReadonlySet<string>) => {
    const epoch = epochRef.current;
    const selected = new Set(requested ?? keysRef.current);
    const songs = await readCurrent();
    if (scopeRef.current !== scope || epochRef.current !== epoch) {
      throw new Error('Selection scope changed. Select songs again.');
    }
    return songs.filter((song) => selected.has(songKey(song)));
  };
  return {
    active,
    keys,
    scope,
    toggle,
    clear,
    resolve,
    busy: selectAll.isPending,
    setActive: (value: boolean) => setState({ scope, active: value, keys: new Set() }),
    selectLoaded: () =>
      setState((previous) => ({
        scope,
        active: true,
        keys: new Set([...(previous.scope === scope ? previous.keys : []), ...loaded.map(songKey)]),
      })),
    selectAll: () =>
      selectAll.mutate({ requestScope: scope, epoch: epochRef.current, requestFilters: filters }),
  };
}

export type LibrarySelection = ReturnType<typeof useLibrarySelection>;
