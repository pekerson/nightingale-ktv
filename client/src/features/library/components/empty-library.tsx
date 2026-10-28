import { Disc3Icon, FolderIcon, MusicIcon } from 'lucide-react';

import { useDialog } from '@/features/menu/hooks/use-dialog';
import { useLibrarySourceActions } from '@/features/sources/hooks/use-library-source-actions';
import { JellyfinIcon } from '@/shared/components/icons/jellyfin';
import { PlexIcon } from '@/shared/components/icons/plex';
import { Button } from '@/shared/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/shared/components/ui/empty';
import { useI18n } from '@/shared/i18n/use-i18n';

export const EmptyLibrary = () => {
  const { t } = useI18n();

  const { selectFolder, isPending, libraryPinned } = useLibrarySourceActions();
  const { setMode } = useDialog();

  // Pinned library: nothing to pick in-app. An empty list here means the
  // configured folder is still scanning or has no supported files.
  if (libraryPinned) {
    return (
      <Empty className="px-4 pt-16 md:pt-6">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <MusicIcon />
          </EmptyMedia>
          <EmptyTitle>{t('No songs found')}</EmptyTitle>
          <EmptyDescription>
            {t(
              'The configured music folder is empty or still being scanned. Add supported files to it, then rescan from the sidebar.',
            )}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <Empty className="px-4 pt-16 md:pt-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <MusicIcon />
        </EmptyMedia>
        <EmptyTitle>{t('No library yet')}</EmptyTitle>
        <EmptyDescription>
          {t(
            'Pick a folder on this machine or connect a Plex, Jellyfin, or Navidrome server to start enjoying your karaoke!',
          )}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-lg flex-col justify-center gap-2 sm:flex-row sm:flex-wrap">
        <Button variant="outline" onClick={() => setMode('plex-connect')} disabled={isPending}>
          <PlexIcon /> {t('Connect Plex')}
        </Button>
        <Button variant="outline" onClick={() => setMode('navidrome-connect')} disabled={isPending}>
          <Disc3Icon /> {t('Connect Navidrome')}
        </Button>
        <Button variant="outline" onClick={() => setMode('jellyfin-connect')} disabled={isPending}>
          <JellyfinIcon /> {t('Connect Jellyfin')}
        </Button>
        <Button variant="outline" onClick={() => selectFolder()} disabled={isPending}>
          <FolderIcon /> {t('Select folder')}
        </Button>
      </EmptyContent>
    </Empty>
  );
};
