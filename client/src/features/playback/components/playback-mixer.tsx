import { useState } from 'react';
import { toast } from 'sonner';

import { setMicMonitorGain } from '@/bridge/microphone';
import { usePlaybackConfigPersist } from '@/features/playback/hooks/use-playback-config-persist';
import {
  usePlaybackMicActions,
  usePlaybackMicState,
  usePlaybackTransportActions,
  usePlaybackTransportState,
} from '@/features/playback/providers';
import { Button } from '@/shared/components/ui/button';
import { Slider } from '@/shared/components/ui/slider';
import { useConfig } from '@/shared/config/use-config';
import { useI18n } from '@/shared/i18n/use-i18n';

function MixerSlider({
  label,
  value,
  maximum = 1,
  disabled = false,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  maximum?: number;
  disabled?: boolean;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="flex justify-between gap-2 text-[0.6875rem]">
        <span>{label}</span>
        <span className="tabular-nums">{Math.round(value * 100)}%</span>
      </div>
      <Slider
        aria-label={label}
        aria-valuetext={`${Math.round(value * 100)}%`}
        className="h-7 [&_[data-slot=slider-track]]:bg-white/25 [&_[data-slot=slider-range]]:bg-white/80"
        min={0}
        max={maximum}
        step={0.01}
        value={[value]}
        disabled={disabled}
        onValueChange={([next]) => onChange(next)}
        onValueCommit={([next]) => onCommit(next)}
      />
    </div>
  );
}

export function PlaybackMixer() {
  const { t } = useI18n();
  const { data: config } = useConfig();
  const persist = usePlaybackConfigPersist(config ?? null);
  const { instrumentalVolume, guideVolume, guideAvailable, isFinished } =
    usePlaybackTransportState();
  const { setInstrumentalVolume, setGuideVolume } = usePlaybackTransportActions();
  const { micMonitorUserEnabled } = usePlaybackMicState();
  const { handleToggleMicMonitor } = usePlaybackMicActions();
  const savedMicGain = config?.mic_monitor_gain ?? 1;
  const [micInput, setMicInput] = useState({ saved: savedMicGain, value: savedMicGain });
  if (micInput.saved !== savedMicGain) {
    setMicInput({ saved: savedMicGain, value: savedMicGain });
  }
  const micGain = micInput.value;
  const changeMicGain = (value: number) => {
    setMicInput({ saved: savedMicGain, value });
    void setMicMonitorGain(value).catch((error: unknown) => {
      toast.error(
        t('Could not adjust microphone volume: {error}', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    });
  };
  return (
    <fieldset
      className="mt-2 min-w-0 space-y-1 border-t border-white/20 pt-2"
      aria-label={t('Volume mixer')}
      data-nav-passthrough
    >
      <MixerSlider
        label={t(guideAvailable ? 'Accompaniment volume' : 'Original mix volume')}
        value={instrumentalVolume}
        disabled={isFinished}
        onChange={setInstrumentalVolume}
        onCommit={(value) => {
          setInstrumentalVolume(value);
          persist({ instrumental_volume: value });
        }}
      />
      <MixerSlider
        label={t('Dry vocal volume')}
        value={guideVolume}
        disabled={!guideAvailable || isFinished}
        onChange={setGuideVolume}
        onCommit={(value) => {
          setGuideVolume(value);
          persist({ guide_volume: value });
        }}
      />
      {!guideAvailable && (
        <p className="text-[0.625rem] text-white/60">
          {t('Separate vocals first to control the vocal track independently.')}
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[0.6875rem]">{t('Microphone monitoring')}</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-6 border-white/30 bg-black/10 px-2 text-[0.625rem] text-inherit"
          disabled={isFinished}
          onClick={handleToggleMicMonitor}
          aria-pressed={micMonitorUserEnabled}
        >
          {t(micMonitorUserEnabled ? 'On' : 'Off')}
        </Button>
      </div>
      <MixerSlider
        label={t('Microphone volume')}
        value={micGain}
        maximum={2}
        disabled={isFinished}
        onChange={changeMicGain}
        onCommit={(value) => {
          changeMicGain(value);
          persist({ mic_monitor_gain: value });
        }}
      />
    </fieldset>
  );
}
