import { NAV } from '@/features/settings/components/constants';
import { Hint } from '@/features/settings/components/settings-controls';
import { Button } from '@/shared/components/ui/button';
import { ButtonGroup } from '@/shared/components/ui/button-group';
import { Field } from '@/shared/components/ui/field';
import { Label } from '@/shared/components/ui/label';
import { Slider } from '@/shared/components/ui/slider';
import { useI18n } from '@/shared/i18n/use-i18n';

type FocusClassName = (segment: number, slot?: number) => string;

type PlaybackRangeSettingProps = {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  segment: number;
  unit: 'seconds' | 'offset' | 'scale';
  onChange: (value: number) => void;
  getFocusClassName: FocusClassName;
};

export function PlaybackRangeSetting({
  label,
  hint,
  value,
  min,
  max,
  step,
  segment,
  unit,
  onChange,
  getFocusClassName,
}: PlaybackRangeSettingProps) {
  const { t } = useI18n();
  let display = `${Math.round(value * 100)}%`;
  if (unit === 'seconds') {
    display = t('{value} seconds', { value: Math.round(value * 10) / 10 });
  } else if (unit === 'offset') {
    display = t('{value}% offset', { value: Math.round(value) });
  }
  return (
    <Field data-nav-passthrough>
      <Label>{t(label)}</Label>
      <Hint>
        {t(hint)} {display}
      </Hint>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        aria-label={t(label)}
        aria-valuetext={display}
        onValueChange={([next]) => onChange(next)}
        className={getFocusClassName(segment)}
      />
    </Field>
  );
}

export function AutoAdvanceSetting({
  enabled,
  onChange,
  getFocusClassName,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  getFocusClassName: FocusClassName;
}) {
  const { t } = useI18n();
  return (
    <Field>
      <Label>{t('Automatically play the next queued song')}</Label>
      <Hint>
        {t(
          'After the score page appears, continue only if another queued song exists and there is no interaction. Manual skip-song uses the same setting.',
        )}
      </Hint>
      <ButtonGroup aria-label={t('Automatically play the next queued song')}>
        <Button
          aria-pressed={!enabled}
          variant={enabled ? 'outline' : 'default'}
          className={getFocusClassName(NAV.playback.autoAdvance, 0)}
          onClick={() => onChange(false)}
        >
          {t('Off')}
        </Button>
        <Button
          aria-pressed={enabled}
          variant={enabled ? 'default' : 'outline'}
          className={getFocusClassName(NAV.playback.autoAdvance, 1)}
          onClick={() => onChange(true)}
        >
          {t('On')}
        </Button>
      </ButtonGroup>
    </Field>
  );
}
