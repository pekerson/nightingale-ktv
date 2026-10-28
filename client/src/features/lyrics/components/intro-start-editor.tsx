import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type Ref } from 'react';
import { toast } from 'sonner';

import {
  getSongIntroStart,
  setSongIntroStart,
  songIntroQueryKey,
  songIntroSourceKey,
  type SongIntroStart,
} from '@/bridge/song-intro';
import { useEditorIntroEstimate } from '@/features/lyrics/hooks/use-editor-intro-estimate';
import {
  formatIntroParts,
  parseIntroParts,
  normalizeIntroPart,
  type IntroTimeParts,
  type IntroTimeField,
} from '@/features/lyrics/utils/intro-time';
import { Button } from '@/shared/components/ui/button';
import { Input } from '@/shared/components/ui/input';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { Song } from '@/types/Song';

type Props = { song: Song; disabled: boolean; containerRef: Ref<HTMLDivElement> };
const TIME_FIELDS: { field: IntroTimeField; label: string }[] = [
  { field: 'minutes', label: 'Minutes' },
  { field: 'seconds', label: 'Seconds' },
  { field: 'milliseconds', label: 'Milliseconds' },
];

function initialStart(data: SongIntroStart | undefined, estimated: number | null): number {
  return data?.start_sec ?? estimated ?? 0;
}
function introEditorState(
  draft: IntroTimeParts | null,
  data: SongIntroStart | undefined,
  busy: boolean,
  estimated: number | null,
) {
  const parts = draft ?? formatIntroParts(initialStart(data, estimated));
  const parsed = parseIntroParts(parts);
  const invalid = parsed === undefined || parsed >= (data ? data.duration_sec : 0);
  const canSave = !busy && data !== undefined && !invalid && draft !== null;
  return { parts, parsed, invalid, canSave };
}

function automaticOptions(song: Song, data: SongIntroStart | undefined, sourceKey: string) {
  return {
    sourceKey,
    enabled: data !== undefined && data.start_sec === null,
    duration: data?.duration_sec ?? song.duration_secs,
    tempo: data?.tempo ?? song.tempo,
  };
}
function hasManualIntro(data: SongIntroStart | undefined): boolean {
  return data !== undefined && data.start_sec !== null;
}

function useIntroEditorState(song: Song, disabled: boolean) {
  const fileHash = song.file_hash;
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const { data: config } = useConfig();
  const sourceKey = songIntroSourceKey(config?.library_source);
  const scope = `${sourceKey}:${fileHash}`;
  const query = useQuery({
    queryKey: songIntroQueryKey(fileHash, sourceKey),
    queryFn: () => getSongIntroStart(fileHash),
    enabled: config !== undefined,
  });
  const [buffer, setDraft] = useState<{ scope: string; parts: IntroTimeParts } | null>(null);
  const draft = buffer?.scope === scope ? buffer.parts : null;
  const mutation = useMutation({
    mutationFn: (start: number | null) => setSongIntroStart(fileHash, start),
    onSuccess: (saved) => {
      queryClient.setQueryData(songIntroQueryKey(fileHash, sourceKey), saved);
      setDraft(null);
      toast.success(t('Intro start saved. Lyrics and audio timing are unchanged.'));
    },
    onError: (error: Error) =>
      toast.error(t('Could not save intro start: {error}', { error: error.message })),
  });
  const busy = [
    disabled,
    query.isLoading,
    query.isFetching,
    query.isError,
    mutation.isLoading,
    config === undefined,
  ].some(Boolean);
  const freshData = query.isFetching || query.isError ? undefined : query.data;
  const automatic = useEditorIntroEstimate(song, automaticOptions(song, freshData, sourceKey));
  const { parts, parsed, invalid, canSave } = introEditorState(
    draft,
    freshData,
    busy,
    automatic.onset,
  );
  const save = () => {
    if (canSave) {
      mutation.mutate(parsed ?? 0);
    }
  };
  const restore = () => {
    if (!busy && query.data) {
      mutation.mutate(null);
    }
  };

  return {
    parts,
    draft,
    automatic,
    manual: hasManualIntro(freshData),
    invalid,
    canSave,
    busy,
    save,
    restore,
    loadError: query.isError,
    canRestore: !busy && query.data !== undefined,
    change: (field: IntroTimeField, value: string) =>
      setDraft({ scope, parts: { ...parts, [field]: value } }),
    blur: (field: IntroTimeField) => {
      if (draft !== null) {
        setDraft({ scope, parts: { ...parts, [field]: normalizeIntroPart(field, parts[field]) } });
      }
    },
  };
}

export function IntroStartEditor({ song, disabled, containerRef }: Props) {
  const { t } = useI18n();
  const state = useIntroEditorState(song, disabled);
  const { parts, draft, invalid, canSave, busy, save, restore } = state;

  return (
    <div
      ref={containerRef}
      data-nav-passthrough
      className="mb-3 shrink-0 space-y-2 rounded-md border p-3"
    >
      <p className="block text-sm font-medium" id="song-intro-start-label">
        {t('First lyric start (intro calibration)')}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <fieldset
          aria-labelledby="song-intro-start-label"
          className="flex min-w-0 items-end gap-0.5"
        >
          {TIME_FIELDS.map(({ field, label }, index) => (
            <div key={field} className="flex min-w-0 items-end gap-0.5">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span className="block">{t(label)}</span>
                <Input
                  aria-label={t(label)}
                  inputMode="numeric"
                  value={parts[field]}
                  onChange={(event) => state.change(field, event.target.value)}
                  onBlur={() => state.blur(field)}
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly={busy}
                  aria-invalid={draft !== null && invalid}
                  className="w-[clamp(3rem,14vw,4rem)] text-center font-mono tabular-nums"
                />
              </label>
              {index < 2 && (
                <span aria-hidden="true" className="pb-1">
                  {index === 0 ? ':' : '.'}
                </span>
              )}
            </div>
          ))}
        </fieldset>
        <Button
          type="button"
          variant="outline"
          aria-disabled={!canSave}
          onClick={save}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {t('Save intro start')}
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-disabled={!state.canRestore}
          onClick={restore}
          className="aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {t('Restore automatic intro')}
        </Button>
      </div>
      <IntroEstimateStatus
        manual={state.manual}
        automatic={state.automatic}
        dirty={draft !== null}
      />
      <p className="text-xs text-muted-foreground">
        {t(
          'Only changes where Skip intro jumps. It does not shift lyrics, change audio, or run AI. Use original-speed time; 0 means no intro.',
        )}
      </p>
      {draft !== null && invalid && (
        <p role="alert" className="text-xs text-destructive">
          {t(
            'Minutes and seconds must be integers from 0 to 59, milliseconds from 0 to 999, and the total must be shorter than the song.',
          )}
        </p>
      )}
      {state.loadError && (
        <p role="alert" className="text-xs text-destructive">
          {t('Could not load this song’s intro calibration.')}
        </p>
      )}
    </div>
  );
}

function unavailableEstimateMessage(source: string): string {
  if (source === 'lyrics') {
    return 'Vocal detection is unavailable; using the lyric start. You can adjust it manually.';
  }
  if (source === 'vocals') {
    return 'Lyrics are unavailable; using the vocal start. You can adjust it manually.';
  }
  return 'Automatic detection could not read the song. 00:00.000 is a placeholder; enter the start manually.';
}

function estimateMessage(
  manual: boolean,
  automatic: ReturnType<typeof useEditorIntroEstimate>,
): string {
  if (manual) {
    return 'Saved manual start (original speed).';
  }
  if (automatic.pending) {
    return 'Estimating the automatic start. You can enter a time now.';
  }
  if (automatic.issue) {
    return unavailableEstimateMessage(automatic.source);
  }
  if (automatic.source === 'vocals') {
    return 'Automatic start from the vocal track (original speed).';
  }
  if (automatic.source === 'lyrics') {
    return 'Automatic start from lyrics (original speed).';
  }
  return 'Start not identified. 00:00.000 is a placeholder; enter the start manually.';
}
function IntroEstimateStatus({
  manual,
  automatic,
  dirty,
}: {
  manual: boolean;
  automatic: ReturnType<typeof useEditorIntroEstimate>;
  dirty: boolean;
}) {
  const { t } = useI18n();
  return (
    <output className="block text-xs text-muted-foreground">
      {t(estimateMessage(manual, automatic))}
      {dirty ? t(' • unsaved changes') : ''}
    </output>
  );
}
