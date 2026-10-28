import { useContext } from 'react';

import { I18nContext } from '@/shared/i18n/context';

export function useI18n() {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error('useI18n must be used within LanguageProvider');
  }
  return value;
}
