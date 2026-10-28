import type { RefObject } from 'react';

import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/components/ui/empty';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { Song } from '@/types/Song';
import type { SongSort } from '@/types/SongSort';
import type { SongSortColumn } from '@/types/SongSortColumn';

import type { SongListView } from '../library-toolbar';
import type { SongItemProps } from './types';
import { SongGrid } from './views/song-grid';
import { SongTable } from './views/song-table';

type SongListProps = {
  songs: Song[];
  view: SongListView;
  sort: readonly SongSort[];
  sortingDisabled: boolean;
  loading: boolean;
  filtered: boolean;
  getItemProps: (song: Song, index: number) => SongItemProps;
  setScrollContainer: (element: HTMLElement | null) => void;
  sentinelRef: RefObject<HTMLDivElement | null>;
  onSort: (column: SongSortColumn) => void;
};

export const SongList = ({
  songs,
  view,
  sort,
  sortingDisabled,
  loading,
  filtered,
  getItemProps,
  setScrollContainer,
  sentinelRef,
  onSort,
}: SongListProps) => {
  const { t } = useI18n();

  if (songs.length === 0 && !loading) {
    return (
      <Empty className="px-4">
        <EmptyHeader>
          <EmptyTitle>{filtered ? t('No results') : t('No songs found')}</EmptyTitle>
          <EmptyDescription>
            {filtered
              ? t('No songs match your search or filters. Try adjusting them.')
              : t('This library is empty or still being scanned.')}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div
      ref={setScrollContainer}
      data-song-layout={view}
      className="themed-scrollbar song-table-shell min-h-0 max-w-full flex-1 overflow-x-hidden overflow-y-auto pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      {view === 'table' ? (
        <SongTable
          songs={songs}
          sort={sort}
          sortingDisabled={sortingDisabled}
          onSort={onSort}
          getItemProps={getItemProps}
        />
      ) : (
        <SongGrid songs={songs} getItemProps={getItemProps} />
      )}
      <div ref={sentinelRef} className="h-1" aria-hidden="true" />
    </div>
  );
};
