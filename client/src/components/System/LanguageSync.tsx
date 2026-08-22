// Applies the stored language preference to i18n, and reports the transition.
//
// A render-null component rather than a hook because it must live high in the tree
// (App.jsx) where there is no natural host component.
//
// The `isCurrentRequest` flag guards the case that matters: switching languages
// twice quickly means two catalogue loads in flight, and only the latest may clear
// `languageLoading`. Without it a slow first request resolves last and reports the
// wrong language as settled.

import { useEffect } from 'react';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import i18n, { changeLanguageSafely, normalizeLocale } from '~/locales/i18n';
import store from '~/store';

export default function LanguageSync() {
  const lang = useRecoilValue(store.lang);
  const setLanguageLoading = useSetRecoilState(store.languageLoading);

  useEffect(() => {
    if (i18n.language === normalizeLocale(lang)) {
      setLanguageLoading(false);
      return;
    }

    let isCurrentRequest = true;
    setLanguageLoading(true);

    changeLanguageSafely(lang)
      .catch((error) => {
        console.error('[i18n] Failed to change language', error);
      })
      .finally(() => {
        if (isCurrentRequest) {
          setLanguageLoading(false);
        }
      });

    return () => {
      isCurrentRequest = false;
    };
  }, [lang, setLanguageLoading]);

  return null;
}
