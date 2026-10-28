import type { MicCaptureOptions } from '@/types/MicCaptureOptions';
import type { MicrophoneInfo } from '@/types/MicrophoneInfo';
import type { MicSampleFrame } from '@/types/MicSampleFrame';

import type { MicSamplesCallback, StopListening } from './microphone-samples';
import { setTauriMicMonitorGain, tauriMicrophoneAdapter } from './microphone.tauri';
import { setWebMicMonitorGain, webMicrophoneAdapter } from './microphone.web';
import { invoke, isTauri } from './runtime';

export type { MicSamplesCallback, StopListening } from './microphone-samples';
export type { MicCaptureOptions, MicSampleFrame };

export type MicrophoneAdapter = {
  listDevices(combineChannels: boolean): Promise<MicrophoneInfo[]>;
  startCapture(
    captureId: string,
    preferred: string | null,
    options: MicCaptureOptions,
  ): Promise<string>;
  stopCapture(captureId: string): Promise<void>;
  subscribe(captureId: string, cb: MicSamplesCallback): Promise<StopListening>;
};

export { tauriMicrophoneAdapter, webMicrophoneAdapter };

export const microphoneAdapter: MicrophoneAdapter = isTauri
  ? tauriMicrophoneAdapter
  : webMicrophoneAdapter;

export const listMicrophones = (combineChannels = true): Promise<MicrophoneInfo[]> =>
  microphoneAdapter.listDevices(combineChannels);

const DEFAULT_CAPTURE_ID = 'default';

export const startMicCapture = (
  preferred: string | null,
  options: MicCaptureOptions,
): Promise<string> => microphoneAdapter.startCapture(DEFAULT_CAPTURE_ID, preferred, options);

export const stopMicCapture = (): Promise<void> =>
  microphoneAdapter.stopCapture(DEFAULT_CAPTURE_ID);

/**
 * Updates browser-routed monitors. Native default output receives the same
 * gain server-side through save_config or set_mic_monitor_gain.
 */
export const updateMicMonitorGain = (value: number): void => {
  if (isTauri) {
    setTauriMicMonitorGain(value);
    return;
  }
  setWebMicMonitorGain(value);
};

export const setMicMonitorGain = async (gain: number): Promise<void> => {
  updateMicMonitorGain(gain);
  if (isTauri) {
    await invoke<void>('set_mic_monitor_gain', { gain });
  }
};
