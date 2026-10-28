import { createContext } from 'react';

import type { Translator } from '@/shared/i18n/translate';
import type { UiLanguage } from '@/types/UiLanguage';

export type I18nValue = {
  language: UiLanguage;
  t: Translator;
};

export const I18nContext = createContext<I18nValue | null>(null);
