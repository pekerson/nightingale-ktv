import type { QueuedStatus } from '@/types/QueuedStatus';
import type { Song } from '@/types/Song';

export type SongItemProps = {
  song: Song;
  selection?: { checked: boolean; onToggle: (song: Song) => void };
  queueStatus?: QueuedStatus;
  index: number;
  isFocused: boolean;
  isSelected: boolean;
  onSelect: (song: Song) => void;
};
