import { ListPlusIcon } from 'lucide-react';

import { getSongStatusInfo } from '@/features/library/components/song/song-status';
import { useAddPlaybackQueueEntry } from '@/features/playback-queue/use-playback-queue';
import { Button } from '@/shared/components/ui/button';
import { Spinner } from '@/shared/components/ui/spinner';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { QueuedStatus } from '@/types/QueuedStatus';
import type { Song } from '@/types/Song';

export function QuickQueueButton({
  song,
  queueStatus,
}: {
  song: Song;
  queueStatus?: QueuedStatus;
}) {
  const { t } = useI18n();
  const { mutate, isLoading } = useAddPlaybackQueueEntry();
  const ready = getSongStatusInfo(song.is_analyzed, queueStatus, t).isReady === true;

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="outline"
      className="shrink-0"
      data-nav-passthrough
      disabled={!ready || isLoading}
      aria-label={t('Add {title} to playback queue', { title: song.title })}
      title={t(ready ? 'Add to queue' : 'Analyze or provide lyrics before adding to the queue')}
      onKeyDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        mutate({ song, tempo: song.tempo, keyOffset: song.key_offset });
      }}
    >
      {isLoading ? <Spinner /> : <ListPlusIcon />}
    </Button>
  );
}
