import { BUILT_IN_BACKGROUND_OPTIONS, selectionKey } from '@/features/playback/components/theme';
import type { Translator } from '@/shared/i18n/translate';
import type { AppConfig } from '@/types/AppConfig';
import type { BackgroundSelection } from '@/types/BackgroundSelection';
import type { CustomBackground } from '@/types/CustomBackground';

type BackgroundOption = {
  value: string;
  label: string;
  description: string;
  selection: BackgroundSelection;
  translateLabel?: boolean;
};

export function backgroundOptions(
  customBackgrounds: readonly CustomBackground[],
  t: Translator,
): BackgroundOption[] {
  return [
    ...BUILT_IN_BACKGROUND_OPTIONS.map((option) => ({
      value: selectionKey(option.selection),
      label: option.label,
      description: 'Built in',
      selection: option.selection,
    })),
    ...customBackgrounds.map((background) => {
      const selection = { kind: 'custom' as const, id: background.id };
      return {
        value: selectionKey(selection),
        label: background.name,
        translateLabel: false,
        description: t('Custom {0}', { '0': t(background.background_type) }),
        selection,
      };
    }),
  ];
}

export function initialBackgroundSelection(
  config: AppConfig,
  options: readonly BackgroundOption[],
): string {
  if (config.last_background !== null) {
    const selected = selectionKey(config.last_background);
    if (options.some((option) => option.value === selected)) {
      return selected;
    }
  }
  return options[config.last_theme ?? 0]?.value ?? options[0].value;
}
