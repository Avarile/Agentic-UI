// The UI language, resolved from the most specific source available.
//
// Precedence in `defaultLang()`: an explicit cookie (set server-side, so it can
// follow an account), then localStorage, then the browser's own preference, then
// 'en'. The cookie comes first so a server-side choice is not overridden by a
// stale local value.
//
// `readStoredLang` tolerates both raw and JSON-encoded values because the key has
// been written by both `atomWithLocalStorage` (which stringifies) and older code
// (which did not).
//
// `languageLoading` gates rendering while a catalogue is fetched — see
// components/System/LanguageSync.tsx.

import { atom } from 'recoil';
import Cookies from 'js-cookie';
import { atomWithLocalStorage } from './utils';

const readStoredLang = () => {
  if (typeof localStorage === 'undefined') {
    return undefined;
  }

  const storedLang = localStorage.getItem('lang');
  if (!storedLang) {
    return undefined;
  }

  try {
    const parsedLang = JSON.parse(storedLang);
    return typeof parsedLang === 'string' ? parsedLang : storedLang;
  } catch {
    return storedLang;
  }
};

const defaultLang = () => {
  const userLang =
    (typeof navigator !== 'undefined' ? navigator.language || navigator.languages?.[0] : null) ??
    'en';
  return Cookies.get('lang') || readStoredLang() || userLang;
};

const lang = atomWithLocalStorage('lang', defaultLang());
const languageLoading = atom<boolean>({
  key: 'languageLoading',
  default: false,
});

export default { lang, languageLoading };
