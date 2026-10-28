import { Disc3Icon, FolderIcon, RefreshCwIcon } from 'lucide-react';
import { useMemo, type ComponentType, type SVGProps } from 'react';

import type { BadgeTone } from '@/features/menu/components/sidebar/source-action-button';
import { useDialog } from '@/features/menu/hooks/use-dialog';
import { useLibrarySourceActions } from '@/features/sources/hooks/use-library-source-actions';
import { JellyfinIcon } from '@/shared/components/icons/jellyfin';
import { PlexIcon } from '@/shared/components/icons/plex';
import type { Translator } from '@/shared/i18n/translate';
import { useI18n } from '@/shared/i18n/use-i18n';

export type SourceButton = {
  key: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  tooltip: string;
  handler: () => void;
  disabled: boolean;
  badge?: BadgeTone;
};

type RemoteBadgeInput = {
  label: string;
  baseUrl: string | undefined;
  health: { reachable: boolean; server_name?: string; error?: string } | undefined;
};

/**
 * Reduces a remote source's `(connected? health?)` state into the tooltip
 * text and badge tone for its sidebar button. Shared by both Jellyfin and
 * Navidrome so the wording stays consistent and adding another remote
 * source costs one call instead of a new copy of the branch ladder.
 */
const remoteBadge = (
  { label, baseUrl, health }: RemoteBadgeInput,
  t: Translator,
): { tooltip: string; badge?: BadgeTone } => {
  if (typeof baseUrl !== 'string' || baseUrl === '') {
    return { tooltip: t('Connect {0}', { '0': label }) };
  }
  const hostname = health?.server_name ?? baseUrl.replace(/^https?:\/\//, '');
  if (!health) {
    return { tooltip: t('Checking {0}…', { '0': hostname }), badge: 'muted' };
  }
  if (health.reachable) {
    return { tooltip: t('Connected to: {0}', { '0': hostname }), badge: 'ok' };
  }
  return {
    tooltip:
      typeof health.error === 'string' && health.error !== ''
        ? t('Offline: {0} — {1}', { '0': hostname, '1': health.error })
        : t('Offline: {0}', { '0': hostname }),
    badge: 'warn',
  };
};

/**
 * Derives the ordered list of Library-cluster buttons (Jellyfin, Navidrome,
 * Folder, Rescan) along with their dynamic state — most notably the remote
 * connection badges + tooltips driven by their respective health hooks.
 * Centralising this keeps `FolderActions` focused on layout + focus
 * management.
 */
export const useSourceButtons = (): SourceButton[] => {
  const { t } = useI18n();
  const { setMode } = useDialog();
  const {
    selectFolder,
    rescan,
    rescanDisabled,
    isPending,
    hasSource,
    libraryPinned,
    jellyfinSource,
    navidromeSource,
    plexSource,
    jellyfinHealth,
    navidromeHealth,
    plexHealth,
  } = useLibrarySourceActions();

  const jellyfin = useMemo(
    () =>
      remoteBadge(
        {
          label: 'Jellyfin',
          baseUrl: jellyfinSource?.base_url,
          health: jellyfinHealth,
        },
        t,
      ),
    [jellyfinSource, jellyfinHealth, t],
  );

  const navidrome = useMemo(
    () =>
      remoteBadge(
        {
          label: 'Navidrome',
          baseUrl: navidromeSource?.base_url,
          health: navidromeHealth,
        },
        t,
      ),
    [navidromeSource, navidromeHealth, t],
  );

  const plex = useMemo(
    () =>
      remoteBadge(
        {
          label: 'Plex',
          baseUrl: plexSource?.base_url,
          health: plexHealth,
        },
        t,
      ),
    [plexSource, plexHealth, t],
  );

  return useMemo<SourceButton[]>(() => {
    // Operator pinned the library folder: source switching is disabled, only
    // the rescan action stays available.
    const buttons: SourceButton[] = libraryPinned
      ? []
      : [
          {
            key: 'plex',
            icon: PlexIcon,
            label: t('Connect Plex'),
            tooltip: plex.tooltip,
            handler: () => setMode('plex-connect'),
            disabled: isPending,
            badge: plex.badge,
          },
          {
            key: 'navidrome',
            icon: Disc3Icon,
            label: t('Connect Navidrome'),
            tooltip: navidrome.tooltip,
            handler: () => setMode('navidrome-connect'),
            disabled: isPending,
            badge: navidrome.badge,
          },
          {
            key: 'jellyfin',
            icon: JellyfinIcon,
            label: t('Connect Jellyfin'),
            tooltip: jellyfin.tooltip,
            handler: () => setMode('jellyfin-connect'),
            disabled: isPending,
            badge: jellyfin.badge,
          },
          {
            key: 'folder',
            icon: FolderIcon,
            label: t('Select folder'),
            tooltip: t('Select folder'),
            handler: hasSource ? () => setMode('folder-source-confirm') : selectFolder,
            disabled: isPending,
          },
        ];

    if (hasSource) {
      buttons.push({
        key: 'rescan',
        icon: RefreshCwIcon,
        label: t('Rescan library'),
        tooltip: t('Rescan library (reuses cached analyses)'),
        handler: rescan,
        disabled: rescanDisabled,
      });
    }

    return buttons;
  }, [
    hasSource,
    libraryPinned,
    isPending,
    jellyfin,
    navidrome,
    plex,
    rescan,
    rescanDisabled,
    selectFolder,
    setMode,
    t,
  ]);
};
