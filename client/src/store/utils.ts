// `atomWithLocalStorage` — the Recoil persistence helper.
//
// Every persisted Recoil atom in the store goes through here, which is what makes
// read, write and recovery behaviour uniform. Three things it guarantees:
//
//   - a corrupt or unparseable stored value falls back to the default *and*
//     rewrites storage, so a bad value cannot fail on every subsequent boot
//   - the optional `normalizeSavedValue` runs on load and persists the normalized
//     result, giving migrations a place to live (see store/settings.ts's speech
//     engines)
//   - `onSet` writes on every change, so no call site has to remember to persist

import { atom } from 'recoil';

// Improved helper function to create atoms with localStorage
export function atomWithLocalStorage<T>(
  key: string,
  defaultValue: T,
  normalizeSavedValue: (value: T) => T = (value) => value,
) {
  return atom<T>({
    key,
    default: defaultValue,
    effects_UNSTABLE: [
      ({ setSelf, onSet }) => {
        const savedValue = localStorage.getItem(key);
        if (savedValue !== null) {
          try {
            const parsedValue = JSON.parse(savedValue) as T;
            const normalizedValue = normalizeSavedValue(parsedValue);
            if (!Object.is(normalizedValue, parsedValue)) {
              localStorage.setItem(key, JSON.stringify(normalizedValue));
            }
            setSelf(normalizedValue);
          } catch (e) {
            console.error(
              `Error parsing localStorage key "${key}", \`savedValue\`: defaultValue, error:`,
              e,
            );
            localStorage.setItem(key, JSON.stringify(defaultValue));
            setSelf(defaultValue);
          }
        }

        onSet((newValue: T) => {
          localStorage.setItem(key, JSON.stringify(newValue));
        });
      },
    ],
  });
}
