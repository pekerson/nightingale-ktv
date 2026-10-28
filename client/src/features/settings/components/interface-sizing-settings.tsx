import { Field } from '@/shared/components/ui/field';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { useConfigMutation } from '@/shared/config/use-config-mutation';
import { interfaceFontSize } from '@/shared/config/use-interface-font';
import { useI18n } from '@/shared/i18n/use-i18n';
import type { AppConfig } from '@/types/AppConfig';

import { NAV, type SettingsOption } from './constants';
import { Hint, SettingsSelect } from './settings-controls';

type FocusClass = (segment: number, slot?: number) => string;

export function AppFontSetting({
  value,
  segment,
  getFocusClassName,
}: {
  value: number | null | undefined;
  segment: number;
  getFocusClassName: FocusClass;
}) {
  const { t } = useI18n();
  const { mutate } = useConfigMutation();
  const size = interfaceFontSize(value);
  return (
    <Field data-nav-passthrough>
      <Label>{t('Application font size')}</Label>
      <Hint>
        {t('Base text size for menus and settings. Default: 16 px.')} {size} px
      </Hint>
      <Slider
        aria-label={t('Application font size')}
        aria-valuetext={`${size} px`}
        min={12}
        max={24}
        step={1}
        value={[size]}
        className={getFocusClassName(segment)}
        onValueChange={([app_font_size]) => mutate({ app_font_size })}
      />
    </Field>
  );
}

const HORIZONTAL: SettingsOption[] = [
  { value: 'left', label: 'Left' },
  { value: 'center', label: 'Center' },
  { value: 'right', label: 'Right' },
];
const VERTICAL: SettingsOption[] = [
  { value: 'default', label: 'Original position' },
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

export function PitchAnchorSettings({
  config,
  getFocusClassName,
}: {
  config: AppConfig | undefined;
  getFocusClassName: FocusClass;
}) {
  const { t } = useI18n();
  const { mutate } = useConfigMutation();
  return (
    <>
      <Field>
        <Label htmlFor="pitch-horizontal-anchor">{t('Pitch graph horizontal position')}</Label>
        <SettingsSelect
          id="pitch-horizontal-anchor"
          label="Pitch graph horizontal position"
          placeholder="Center"
          value={config?.pitch_graph_horizontal_position ?? 'center'}
          options={HORIZONTAL}
          triggerClassName={getFocusClassName(NAV.playback.pitchHorizontal)}
          onValueChange={(pitch_graph_horizontal_position) =>
            mutate({ pitch_graph_horizontal_position })
          }
        />
      </Field>
      <Field>
        <Label htmlFor="pitch-vertical-anchor">{t('Pitch graph vertical position')}</Label>
        <Hint>
          {t('Choose an independent pitch graph position, then fine-tune with the offset sliders.')}
        </Hint>
        <SettingsSelect
          id="pitch-vertical-anchor"
          label="Pitch graph vertical position"
          placeholder="Original position"
          value={config?.pitch_graph_vertical_position ?? 'default'}
          options={VERTICAL}
          triggerClassName={getFocusClassName(NAV.playback.pitchVertical)}
          onValueChange={(value) =>
            mutate({ pitch_graph_vertical_position: value === 'default' ? null : value })
          }
        />
      </Field>
    </>
  );
}
