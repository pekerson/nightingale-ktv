import type { MicCaptureOptions } from '@/types/MicCaptureOptions';
import type { MicrophoneInfo } from '@/types/MicrophoneInfo';
import type { MicSampleFrame } from '@/types/MicSampleFrame';

import {
  currentAudioOutputRoutes,
  subscribeAudioOutputRoutes,
  usesDefaultAudioOutput,
  reportAudioOutputIssue,
} from './audio-outputs';
import type { MicrophoneAdapter } from './microphone';
import { dispatchMicFrame, subscribeMicSamples } from './microphone-samples';
import { NativePcmMonitor } from './native-pcm-monitor';
import { createChannel, invoke } from './runtime';

/**
 * Serializes start/stop so React's stop-then-start on song change can't race
 * at the Tauri IPC layer (commands run on a worker pool and would otherwise
 * be free to reorder).
 */
let opChain: Promise<unknown> = Promise.resolve();

const enqueue = <T>(op: () => Promise<T>): Promise<T> => {
  const next = opChain.catch(() => undefined).then(op);
  opChain = next;
  return next;
};

type Monitor = { requested: boolean; pcm: NativePcmMonitor | null; unsubscribe: () => void };
const monitors = new Map<string, Monitor>();
let monitorGain = 1;
export function setTauriMicMonitorGain(value: number): void {
  monitorGain = Math.max(0, Math.min(2, value));
  for (const monitor of monitors.values()) {
    monitor.pcm?.setVolume(monitorGain);
  }
}
const removeMonitor = (captureId: string): void => {
  const monitor = monitors.get(captureId);
  monitor?.unsubscribe();
  monitor?.pcm?.dispose();
  monitors.delete(captureId);
};
const syncMonitor = async (captureId: string, monitor: Monitor): Promise<void> => {
  if (monitors.get(captureId) !== monitor) {
    return;
  }
  const direct = usesDefaultAudioOutput(currentAudioOutputRoutes());
  if (direct) {
    monitor.pcm?.dispose();
    monitor.pcm = null;
  }
  await invoke('set_mic_capture_monitor', { captureId, enabled: monitor.requested && direct });
  if (!direct && monitor.requested && !monitor.pcm) {
    monitor.pcm = new NativePcmMonitor(monitorGain);
  }
};
const listDevices = (combineChannels: boolean): Promise<MicrophoneInfo[]> =>
  invoke<MicrophoneInfo[]>('list_microphones', { combineChannels });

const startCapture = (
  captureId: string,
  preferred: string | null,
  options: MicCaptureOptions,
): Promise<string> =>
  enqueue(async () => {
    /**
     * Always allocate a fresh Channel: when Rust drops the previous one in
     * `stop_mic_capture` it sends an `end` message that unregisters the JS
     * callback id. Reusing the cached Channel would hand Rust a dead id and
     * spam "Couldn't find callback id ..." for every frame.
     */
    removeMonitor(captureId);
    const monitor: Monitor = { requested: options.emit_audio, pcm: null, unsubscribe: () => {} };
    const channel = createChannel<MicSampleFrame>();
    channel.onmessage = (frame) => {
      dispatchMicFrame(captureId, frame);
      monitor.pcm?.push(frame);
    };
    const device = await invoke<string>('start_mic_capture', {
      captureId,
      preferred,
      options: {
        emit_audio: options.emit_audio && usesDefaultAudioOutput(currentAudioOutputRoutes()),
      },
      onSamples: channel,
    });
    monitors.set(captureId, monitor);
    monitor.unsubscribe = subscribeAudioOutputRoutes(() => {
      void enqueue(() => syncMonitor(captureId, monitor)).catch((error: unknown) =>
        reportAudioOutputIssue('', error),
      );
    });
    await syncMonitor(captureId, monitor);
    return device;
  });

const stopCapture = (captureId: string): Promise<void> =>
  enqueue(async () => {
    removeMonitor(captureId);
    await invoke('stop_mic_capture', { captureId });
  });

export const tauriMicrophoneAdapter: MicrophoneAdapter = {
  listDevices,
  startCapture,
  stopCapture,
  subscribe: async (captureId, callback) => subscribeMicSamples(captureId, callback),
};
