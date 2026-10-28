import { Checkbox } from '@/shared/components/ui/checkbox';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { Song } from '@/types/Song';

export function SongSelectionCheckbox({
  song,
  checked,
  onToggle,
}: {
  song: Song;
  checked: boolean;
  onToggle: (song: Song) => void;
}) {
  const { t } = useI18n();
  return (
    <Checkbox
      data-nav-passthrough
      aria-label={t('Select {title}', { title: song.title })}
      checked={checked}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      onCheckedChange={() => onToggle(song)}
    />
  );
}
