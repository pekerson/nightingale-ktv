import { useI18n } from '@/shared/i18n/use-i18n';

const MISSING_METADATA_LABELS = new Set(['Unknown Artist', 'Unknown Album']);
const NORMALIZED_MISSING_LABELS: Readonly<Record<string, string>> = {
  'Unknown artist': 'Unknown Artist',
  'Unknown band': 'Unknown Artist',
  'Unknown album': 'Unknown Album',
};

export function MetadataLabel({ value, fallback = '—' }: { value: string; fallback?: string }) {
  const { t } = useI18n();
  if (value === '') {
    return t(fallback);
  }
  const label = NORMALIZED_MISSING_LABELS[value] ?? value;
  return MISSING_METADATA_LABELS.has(label) ? t(label) : value;
}
