// `useLocalize()` — the only sanctioned way to produce user-facing text.
//
// Exports `TranslationKeys`, the union of every key in the English catalogue, so a
// typo is a type error rather than a string rendered raw. That is why the type is
// re-exported from hooks/index.ts and accepted as a parameter by components that
// take a label key instead of a label.
//
// Only `locales/en/translation.json` is edited by hand; other languages are
// synchronized externally.

import { useCallback } from 'react';
import { TOptions } from 'i18next';
import { useTranslation } from 'react-i18next';
import translationEn from '~/locales/en/translation.json';

export type TranslationKeys = keyof typeof translationEn;

export default function useLocalize() {
  const { t } = useTranslation();

  return useCallback(
    (phraseKey: TranslationKeys, options?: TOptions) => t(phraseKey, options),
    [t],
  );
}
