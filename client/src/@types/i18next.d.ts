// Types i18next against the English catalogue, so `useLocalize` keys are checked at
// compile time and a typo is a type error rather than a raw key in the UI.

import translationEn from '~/locales/en/translation.json';
import { defaultNS } from '~/locales/i18n';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: {
      translation: typeof translationEn;
    };
    strictKeyChecks: true;
  }
}
