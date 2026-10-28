import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ScanLine } from 'lucide-react';
import { toast } from 'sonner';

import { loadPlaylistAutoAnalysis, setPlaylistAutoAnalysis } from '@/bridge/playlist-auto-analysis';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';
import { CONFIG, MENU } from '@/shared/query-keys';

function usePlaylistAnalysis() {
  const { t } = useI18n();
  const { dataUpdatedAt } = useConfig();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['playlist-auto-analysis', dataUpdatedAt],
    queryFn: loadPlaylistAutoAnalysis,
  });
  const mutation = useMutation({
    mutationFn: setPlaylistAutoAnalysis,
    onSuccess: async (result) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ['playlist-auto-analysis'] }),
        client.invalidateQueries({ queryKey: CONFIG }),
        client.invalidateQueries({ queryKey: MENU }),
      ]);
      toast.success(
        t('Playlist saved. {count} songs queued for analysis.', { count: result.queuedCount }),
      );
      if (result.syncPending) {
        toast.info(t('Library sync is running. New songs will be analyzed automatically.'));
      }
    },
    onError: (error) =>
      toast.error(t('Could not save playlist analysis: {error}', { error: String(error) })),
  });
  return { query, mutation };
}

function analysisMode(override: boolean | undefined) {
  if (override === undefined) {
    return { value: 'inherit', label: 'Follow global' };
  }
  return override ? { value: 'on', label: 'On' } : { value: 'off', label: 'Off' };
}

function canEdit(sourceKey: string | null | undefined) {
  return typeof sourceKey === 'string';
}

export function PlaylistAutoAnalysisControl({
  playlistId,
  name,
}: {
  playlistId: string;
  name: string;
}) {
  const { t } = useI18n();
  const { query, mutation } = usePlaylistAnalysis();
  const globalEnabled = query.data?.globalEnabled === true;
  const override = query.data?.overrides[playlistId];
  const mode = analysisMode(override);
  const effective = override ?? globalEnabled;
  const label = t('Automatic analysis for {playlist}', { playlist: name });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-nav-passthrough
          aria-label={label}
          title={`${label}: ${t(mode.label)}`}
          disabled={!canEdit(query.data?.sourceKey) || query.isFetching || mutation.isPending}
          className={`flex size-7 shrink-0 items-center justify-center rounded hover:bg-sidebar-accent disabled:opacity-40 ${effective ? 'text-primary' : 'text-muted-foreground'}`}
        >
          <ScanLine className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent data-nav-passthrough align="start" className="max-w-72">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={mode.value}
          onValueChange={(value) => {
            const sourceKey = query.data?.sourceKey;
            if (typeof sourceKey === 'string' && !mutation.isPending) {
              mutation.mutate({
                sourceKey,
                playlistId,
                enabled: value === 'inherit' ? null : value === 'on',
              });
            }
          }}
        >
          <DropdownMenuRadioItem value="inherit">
            {t('Follow global')} ({t(globalEnabled ? 'On' : 'Off')})
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="on">{t('On')}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="off">{t('Off')}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <p className="px-2 py-1 text-xs text-muted-foreground">
          {t(
            'An explicit Off in any playlist takes priority. Existing analysis jobs are not cancelled.',
          )}
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
