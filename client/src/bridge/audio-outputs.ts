import type { AudioOutputRoute } from '@/types/AudioOutputRoute';

export type { AudioOutputRoute };
export type AudioOutputInfo = { id: string; name: string };
export type AudioOutputIssue = { deviceId: string; message: string };
export type AudioOutputRoutes = readonly AudioOutputRoute[] | null;

type RoutesListener = (routes: AudioOutputRoutes) => void;

let configuredRoutes: AudioOutputRoutes = null;
let initialized = false;
let signature = 'null';
const routeListeners = new Set<RoutesListener>();
const issueListeners = new Set<(issue: AudioOutputIssue) => void>();
const issues = new Map<string, AudioOutputIssue>();

export function supportsAudioOutputRouting(): boolean {
  return (
    typeof HTMLMediaElement !== 'undefined' &&
    typeof HTMLMediaElement.prototype.setSinkId === 'function'
  );
}

export function usesDefaultAudioOutput(routes: AudioOutputRoutes): boolean {
  if (routes === null) {
    return true;
  }
  const only = routes[0];
  return (
    routes.length === 1 &&
    only.device_id === '' &&
    only.accompaniment &&
    only.vocals &&
    only.microphone
  );
}

function normalizedRoutes(routes: AudioOutputRoutes): AudioOutputRoutes {
  if (routes === null) {
    return null;
  }
  if (routes.length < 1 || routes.length > 2) {
    throw new Error('Choose one or two speaker outputs.');
  }
  const ids = new Set(routes.map((route) => route.device_id));
  if (ids.size !== routes.length) {
    throw new Error('The same speaker cannot be selected twice.');
  }
  if (
    routes.some((route) => route.device_id === 'default' || route.device_id === 'communications')
  ) {
    throw new Error('Choose a specific speaker instead of a system-device alias.');
  }
  if (routes.length === 2 && routes.some((route) => route.device_id === '')) {
    throw new Error('Choose two specific speaker devices for dual output.');
  }
  return routes.map((route) => ({ ...route }));
}

export function reportAudioOutputIssue(deviceId: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const key = `${deviceId}:${message}`;
  if (issues.has(key)) {
    return;
  }
  const issue = { deviceId, message };
  issues.set(key, issue);
  for (const listener of issueListeners) {
    listener(issue);
  }
}

export function subscribeAudioOutputIssues(
  listener: (issue: AudioOutputIssue) => void,
): () => void {
  issueListeners.add(listener);
  for (const issue of issues.values()) {
    listener(issue);
  }
  return () => {
    issueListeners.delete(listener);
  };
}

export function applyAudioOutputRoutes(routes: AudioOutputRoutes): void {
  let next: AudioOutputRoutes;
  let failure: unknown;
  try {
    next = normalizedRoutes(routes);
  } catch (error) {
    next = [];
    failure = error;
  }
  const nextSignature = JSON.stringify(next);
  initialized = true;
  if (signature !== nextSignature) {
    signature = nextSignature;
    configuredRoutes = next;
    issues.clear();
    for (const listener of routeListeners) {
      listener(next);
    }
  }
  if (failure !== undefined) {
    reportAudioOutputIssue('', failure);
  }
}

export function currentAudioOutputRoutes(): AudioOutputRoutes {
  if (!initialized) {
    applyAudioOutputRoutes(window.__NIGHTINGALE_APP_CONFIG__?.audio_outputs ?? null);
  }
  return configuredRoutes;
}

const onDeviceChange = () => {
  issues.clear();
  for (const listener of routeListeners) {
    listener(configuredRoutes);
  }
};

export function subscribeAudioOutputRoutes(listener: RoutesListener): () => void {
  if (routeListeners.size === 0) {
    if (typeof navigator.mediaDevices !== 'undefined') {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange);
    }
  }
  routeListeners.add(listener);
  return () => {
    routeListeners.delete(listener);
    if (routeListeners.size === 0) {
      if (typeof navigator.mediaDevices !== 'undefined') {
        navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange);
      }
    }
  };
}

export async function listAudioOutputs(): Promise<AudioOutputInfo[]> {
  if (typeof navigator.mediaDevices === 'undefined') {
    throw new TypeError('Audio devices are unavailable. Use HTTPS or localhost.');
  }
  const devices = await navigator.mediaDevices.enumerateDevices();
  const seen = new Set<string>();
  const outputs: AudioOutputInfo[] = [{ id: '', name: 'Default speaker' }];
  for (const device of devices) {
    if (
      device.kind !== 'audiooutput' ||
      ['', 'default', 'communications'].includes(device.deviceId) ||
      seen.has(device.deviceId)
    ) {
      continue;
    }
    seen.add(device.deviceId);
    outputs.push({ id: device.deviceId, name: device.label.trim() || `Speaker ${outputs.length}` });
  }
  return outputs;
}

export async function requestAudioOutputAccess(): Promise<void> {
  if (typeof navigator.mediaDevices === 'undefined') {
    throw new TypeError('Audio device access requires HTTPS or localhost.');
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  for (const track of stream.getTracks()) {
    track.stop();
  }
}
