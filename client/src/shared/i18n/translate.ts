import { audioDevicesChinese } from '@/shared/i18n/catalog-audio-devices';
import { commonChinese } from '@/shared/i18n/catalog-common';
import { engineChinese } from '@/shared/i18n/catalog-engine';
import { flowChinese } from '@/shared/i18n/catalog-flow';
import { interfaceSizingChinese } from '@/shared/i18n/catalog-interface-sizing';
import { keyChinese } from '@/shared/i18n/catalog-key';
import { libraryChinese } from '@/shared/i18n/catalog-library';
import { librarySelectionChinese } from '@/shared/i18n/catalog-library-selection';
import { lyricsEditorChinese } from '@/shared/i18n/catalog-lyrics-editor';
import { pitchChinese } from '@/shared/i18n/catalog-pitch';
import { playbackChinese } from '@/shared/i18n/catalog-playback';
import { playlistChinese } from '@/shared/i18n/catalog-playlist';
import { settingsChinese } from '@/shared/i18n/catalog-settings';
import { shortcutsChinese } from '@/shared/i18n/catalog-shortcuts';
import type { UiLanguage } from '@/types/UiLanguage';

export type Translator = (
  source: string,
  parameters?: Readonly<Record<string, string | number>>,
) => string;

const chinese: Readonly<Record<string, string>> = {
  ...interfaceSizingChinese,
  ...shortcutsChinese,
  ...audioDevicesChinese,
  ...flowChinese,
  ...pitchChinese,
  ...keyChinese,
  ...engineChinese,
  ...commonChinese,
  ...libraryChinese,
  ...librarySelectionChinese,
  ...lyricsEditorChinese,
  ...playbackChinese,
  ...playlistChinese,
  ...settingsChinese,
};

export function createTranslator(language: UiLanguage): Translator {
  return (source, parameters) => {
    const template = language === 'zh-CN' ? (chinese[source] ?? source) : source;
    return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string) => {
      const value = parameters?.[name];
      return value === undefined ? placeholder : String(value);
    });
  };
}
