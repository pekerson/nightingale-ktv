import { memo, type KeyboardEvent } from 'react';

import { QuickQueueButton } from '@/features/library/components/song/quick-queue-button';
import { SongSelectionCheckbox } from '@/features/library/components/song/song-selection-checkbox';
import { cn } from '@/shared/utils/cn';

import { SONG_COLUMNS } from '../song-columns';
import type { SongItemProps } from '../types';

type SongTableRowProps = {
  bestScore?: number;
} & SongItemProps;

export const SongTableRow = memo(
  ({
    song,
    queueStatus,
    index,
    isFocused,
    isSelected,
    onSelect,
    bestScore,
    selection,
  }: SongTableRowProps) => {
    const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }
      event.preventDefault();
      onSelect(song);
    };

    return (
      <tr
        tabIndex={0}
        data-song-index={index}
        aria-selected={isSelected}
        onClick={() => onSelect(song)}
        onKeyDown={onKeyDown}
        className={cn(
          'cursor-pointer border-b border-border/70 outline-none [&>td]:bg-background [&>td]:transition-colors hover:[&>td]:bg-accent focus-visible:[&>td]:bg-primary/15',
          (isFocused || isSelected) && '[&>td]:bg-primary/15 hover:[&>td]:bg-primary/20',
        )}
      >
        <td className="w-20 px-2 py-2">
          <div className="flex items-center gap-2">
            {selection && <SongSelectionCheckbox song={song} {...selection} />}
            <QuickQueueButton song={song} queueStatus={queueStatus} />
          </div>
        </td>
        {SONG_COLUMNS.map((column) => (
          <td key={column.id} className={column.tdClassName}>
            {column.cell(song, queueStatus, bestScore)}
          </td>
        ))}
      </tr>
    );
  },
);
