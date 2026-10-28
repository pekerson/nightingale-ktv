import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import {
  listAudioOutputs,
  requestAudioOutputAccess,
  supportsAudioOutputRouting,
  type AudioOutputInfo,
  type AudioOutputRoute,
} from '@/bridge/audio-outputs';
import { Button } from '@/shared/components/ui/button';
import { Checkbox } from '@/shared/components/ui/checkbox';
import { Field } from '@/shared/components/ui/field';
import { Label } from '@/shared/components/ui/label';
import { useConfigMutation } from '@/shared/config/use-config-mutation';
import type { Translator } from '@/shared/i18n/translate';
import { useI18n } from '@/shared/i18n/use-i18n';

import { NAV, type SettingsOption } from './constants';
import { Hint, SettingsSelect } from './settings-controls';

const DEFAULT_OUTPUT = '__system_default__';
const OFF_OUTPUT = '__second_off__';
const DEFAULT_ROUTE: AudioOutputRoute = {
  device_id: '',
  accompaniment: true,
  vocals: true,
  microphone: true,
};
const SOURCES = [
  { key: 'accompaniment', label: 'Accompaniment' },
  { key: 'vocals', label: 'Dry vocals' },
  { key: 'microphone', label: 'Microphone' },
] as const;

type FocusClass = (segment: number, slot?: number) => string;

function outputOptions(
  devices: readonly AudioOutputInfo[],
  selection: {
    route: AudioOutputRoute | undefined;
    other: AudioOutputRoute | undefined;
    second: boolean;
  },
  t: Translator,
): SettingsOption[] {
  const { route, other, second } = selection;
  const options: SettingsOption[] = [];
  if (second) {
    options.push({ value: OFF_OUTPUT, label: 'Second speaker off' });
  } else if (other === undefined) {
    options.push({ value: DEFAULT_OUTPUT, label: 'Default speaker' });
  }
  if (!second || (other !== undefined && other.device_id !== '')) {
    options.push(
      ...devices
        .filter((device) => device.id !== '' && device.id !== other?.device_id)
        .map((device) => ({ value: device.id, label: device.name, translateLabel: false })),
    );
  }
  if (
    route !== undefined &&
    route.device_id !== '' &&
    !options.some((option) => option.value === route.device_id)
  ) {
    options.push({
      value: route.device_id,
      label: t('Selected speaker is unavailable. Reconnect it or refresh devices.'),
      translateLabel: false,
    });
  }
  return options;
}

function SpeakerSources({
  route,
  number,
  segment,
  disabled,
  onChange,
  getFocusClassName,
}: {
  route: AudioOutputRoute;
  number: number;
  segment: number;
  disabled: boolean;
  onChange: (route: AudioOutputRoute) => void;
  getFocusClassName: FocusClass;
}) {
  const { t } = useI18n();
  return (
    <fieldset
      className="space-y-2"
      aria-label={`${t('Speaker {number}', { number })} · ${t('Audio sources')}`}
    >
      <legend className="text-sm font-medium">{t('Audio sources')}</legend>
      <div className="flex flex-wrap gap-5">
        {SOURCES.map(({ key, label }, slot) => (
          <Label key={key} className="gap-2">
            <Checkbox
              checked={route[key]}
              disabled={disabled}
              className={getFocusClassName(segment, slot)}
              onCheckedChange={(checked) => onChange({ ...route, [key]: checked === true })}
            />
            {t(label)}
          </Label>
        ))}
      </div>
      {!SOURCES.some(({ key }) => route[key]) && (
        <Hint>{t('No sources selected: this speaker will be silent.')}</Hint>
      )}
    </fieldset>
  );
}

function useSpeakerDevices() {
  const query = useQuery({
    queryKey: ['audio-output-devices'],
    queryFn: listAudioOutputs,
    staleTime: 10_000,
  });
  const { refetch } = query;
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (typeof devices === 'undefined') {
      return undefined;
    }
    const changed = () => {
      void refetch();
    };
    devices.addEventListener('devicechange', changed);
    return () => devices.removeEventListener('devicechange', changed);
  }, [refetch]);
  return query;
}

function useDeviceRefresh(refetch: () => Promise<unknown>) {
  const { t } = useI18n();
  const refreshing = useRef(false);
  return async () => {
    if (refreshing.current) {
      return;
    }
    refreshing.current = true;
    try {
      await requestAudioOutputAccess();
      await refetch();
    } catch (error) {
      toast.error(
        t('Could not list speakers: {error}', {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      refreshing.current = false;
    }
  };
}

function SpeakerDiscoveryStatus({ query }: { query: ReturnType<typeof useSpeakerDevices> }) {
  const { t } = useI18n();
  const devices = query.data ?? [];
  return (
    <>
      {!supportsAudioOutputRouting() && (
        <Hint>
          {t(
            'Output device selection is unavailable in this browser. The default speaker will still work.',
          )}
        </Hint>
      )}
      {query.isFetching && <Hint>{t('Looking for available speakers…')}</Hint>}
      {query.isError && (
        <Hint>{t('Could not list speakers: {error}', { error: String(query.error) })}</Hint>
      )}
      {!query.isFetching && devices.every((device) => device.id === '') && (
        <Hint>
          {t(
            'No selectable speakers are available. Check connections and audio permissions, then refresh.',
          )}
        </Hint>
      )}
    </>
  );
}

function routeSelection(routes: AudioOutputRoute[] | null) {
  return { first: routes?.[0] ?? DEFAULT_ROUTE, second: routes?.[1] };
}

export function SpeakerSettings({
  routes,
  getFocusClassName,
}: {
  routes: AudioOutputRoute[] | null;
  getFocusClassName: FocusClass;
}) {
  const { t } = useI18n();
  const { mutate, isLoading: saving } = useConfigMutation();
  const query = useSpeakerDevices();
  const refresh = useDeviceRefresh(query.refetch);
  const { first, second } = routeSelection(routes);
  const devices = query.data ?? [];
  const saveFirst = (route: AudioOutputRoute) =>
    mutate({ audio_outputs: second === undefined ? [route] : [route, second] });
  const saveSecond = (route: AudioOutputRoute) => mutate({ audio_outputs: [first, route] });

  return (
    <>
      <Field>
        <h2 className="text-base font-semibold">{t('Speaker outputs')}</h2>
        <Hint>{t('Choose the sources played by each speaker. You can select more than one.')}</Hint>
        <Label htmlFor="speaker-one">{t('Speaker {number}', { number: 1 })}</Label>
        <SettingsSelect
          id="speaker-one"
          label="Speaker outputs"
          placeholder="Default speaker"
          value={first.device_id === '' ? DEFAULT_OUTPUT : first.device_id}
          options={outputOptions(devices, { route: first, other: second, second: false }, t)}
          disabled={saving}
          triggerClassName={getFocusClassName(NAV.general.speakerOne)}
          onValueChange={(value) =>
            saveFirst({ ...first, device_id: value === DEFAULT_OUTPUT ? '' : value })
          }
        />
      </Field>
      <SpeakerSources
        route={first}
        number={1}
        segment={NAV.general.speakerOneSources}
        disabled={saving}
        onChange={saveFirst}
        getFocusClassName={getFocusClassName}
      />
      <Field>
        <Label htmlFor="speaker-two">{t('Speaker {number}', { number: 2 })}</Label>
        <SettingsSelect
          id="speaker-two"
          label="Speaker outputs"
          placeholder="Second speaker off"
          value={second?.device_id ?? OFF_OUTPUT}
          options={outputOptions(devices, { route: second, other: first, second: true }, t)}
          disabled={saving}
          triggerClassName={getFocusClassName(NAV.general.speakerTwo)}
          onValueChange={(value) =>
            value === OFF_OUTPUT
              ? mutate({ audio_outputs: [first] })
              : saveSecond({ ...(second ?? DEFAULT_ROUTE), device_id: value })
          }
        />
        {first.device_id === '' && (
          <Hint>{t('Select a specific device for speaker 1 before enabling speaker 2.')}</Hint>
        )}
      </Field>
      {second !== undefined && (
        <SpeakerSources
          route={second}
          number={2}
          segment={NAV.general.speakerTwoSources}
          disabled={saving}
          onChange={saveSecond}
          getFocusClassName={getFocusClassName}
        />
      )}
      <Field>
        <Button
          type="button"
          variant="outline"
          className={getFocusClassName(
            second === undefined ? NAV.general.speakerTwoSources : NAV.general.refreshSpeakers,
          )}
          onClick={() => {
            void refresh();
          }}
        >
          {t('Refresh audio devices')}
        </Button>
        <SpeakerDiscoveryStatus query={query} />
        <Hint>
          {t(
            'Device names may require microphone permission. Audio is not recorded while refreshing devices.',
          )}
        </Hint>
        <Hint>
          {t('Microphone routing requires microphone monitoring to be enabled during playback.')}
        </Hint>
        <Hint>
          {t(
            'Without separated stems, accompaniment plays the original mix and dry vocals are unavailable.',
          )}
        </Hint>
      </Field>
    </>
  );
}
