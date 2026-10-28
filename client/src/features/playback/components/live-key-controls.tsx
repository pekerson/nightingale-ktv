import {
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import { Button } from '@/shared/components/ui/button';
import { Spinner } from '@/shared/components/ui/spinner';
import { useI18n } from '@/shared/i18n/use-i18n';

export function LiveKeyControls() {
  const { t } = useI18n();
  const { currentKey, keyOffset, isChangingKey, keyAvailable, isFinished } =
    usePlaybackTransportState();
  const { shiftKey } = usePlaybackTransportActions();
  const disabled = !keyAvailable || isChangingKey || isFinished;

  return (
    <fieldset
      aria-label={t('Live key adjustment')}
      aria-busy={isChangingKey}
      className="min-w-0 space-y-1"
    >
      <div className="flex flex-wrap items-center justify-between gap-1 text-[0.6875rem]">
        <span>
          {t('Current key')}: <strong>{currentKey ?? t('Not detected')}</strong>
        </span>
        <span className="tabular-nums">
          {t('Shift: {semitones}', { semitones: keyOffset > 0 ? `+${keyOffset}` : keyOffset })}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0 text-[0.6875rem] border-white/30 bg-black/10 text-inherit hover:bg-white/15 hover:text-inherit"
          disabled={disabled || keyOffset <= -5}
          onClick={() => shiftKey(-1)}
          aria-label={t('Lower key by one semitone')}
        >
          {t('Lower key')}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-w-0 text-[0.6875rem] border-white/30 bg-black/10 text-inherit hover:bg-white/15 hover:text-inherit"
          disabled={disabled || keyOffset >= 5}
          onClick={() => shiftKey(1)}
          aria-label={t('Raise key by one semitone')}
        >
          {t('Raise key')}
        </Button>
      </div>
      {isChangingKey && (
        <output className="flex items-center gap-1 text-[0.6875rem]">
          <Spinner />
          {t('Preparing key change…')}
        </output>
      )}
      {!keyAvailable && (
        <p className="text-[0.6875rem] opacity-70">
          {t('Key adjustment is unavailable until a compatible song key is detected.')}
        </p>
      )}
    </fieldset>
  );
}
