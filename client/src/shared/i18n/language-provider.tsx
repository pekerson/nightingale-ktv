import { useEffect, useMemo, type ReactNode } from 'react';

import { I18nContext } from '@/shared/i18n/context';
import { createTranslator } from '@/shared/i18n/translate';
import type { UiLanguage } from '@/types/UiLanguage';

export function LanguageProvider({
  language,
  children,
}: {
  language: UiLanguage;
  children: ReactNode;
}) {
  const value = useMemo(() => ({ language, t: createTranslator(language) }), [language]);
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
