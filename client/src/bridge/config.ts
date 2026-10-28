import type { AppConfig } from '@/types/AppConfig';
import type { UiLanguage } from '@/types/UiLanguage';

import { updateMicMonitorGain } from './microphone';
import { invoke, listen, type UnlistenFn } from './runtime';

export function getPreloadedConfig(): AppConfig | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  return window.__NIGHTINGALE_APP_CONFIG__;
}

export const loadConfig = async (): Promise<AppConfig> => {
  return await invoke<AppConfig>('load_config');
};

export const saveConfig = async (config: AppConfig): Promise<AppConfig> => {
  const saved = await invoke<AppConfig>('save_config', { config });

  if (saved.mic_monitor_gain !== null) {
    updateMicMonitorGain(saved.mic_monitor_gain);
  }

  return saved;
};

export const setUiLanguage = (language: UiLanguage): Promise<AppConfig> =>
  invoke<AppConfig>('set_ui_language', { language });

export const setScoreAfterSeek = (enabled: boolean): Promise<AppConfig> =>
  invoke<AppConfig>('set_score_after_seek', { enabled });

export const patchConfig = async (patch: Partial<AppConfig>): Promise<AppConfig> => {
  const saved = await invoke<AppConfig>('patch_config', { patch });
  if (saved.mic_monitor_gain !== null) {
    updateMicMonitorGain(saved.mic_monitor_gain);
  }
  return saved;
};

export const onConfigChanged = (callback: () => void): Promise<UnlistenFn> =>
  listen<null>('config-changed', () => callback());
