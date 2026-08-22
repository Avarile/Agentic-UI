// The extended `useLocalStorage`: same persistence, plus two escape hatches.
//
// `globalSetState` mirrors each write into external state (a store atom), so one
// call keeps both in step instead of the caller remembering to. `storageCondition`
// gates whether a value is written at all, which is how a default or a transient
// value can be held in memory without being persisted.
//
// Confusingly it exports the same hook *name* as useLocalStorage.tsx — the two
// coexist because the simpler one's unconditional write is what its callers rely
// on. Import by path.

import { useEffect, useState, useCallback } from 'react';

export default function useLocalStorage<T>(
  key: string,
  defaultValue: T,
  globalSetState?: (value: T) => void,
  storageCondition?: (value: T, rawCurrentValue?: string | null) => boolean,
): [T, (value: T) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const item = localStorage.getItem(key);

    if (!item && !storageCondition) {
      localStorage.setItem(key, JSON.stringify(defaultValue));
    } else if (!item && storageCondition && storageCondition(defaultValue)) {
      localStorage.setItem(key, JSON.stringify(defaultValue));
    }

    const initialValue = item && item !== 'undefined' ? JSON.parse(item) : defaultValue;
    setValue(initialValue);
    if (globalSetState) {
      globalSetState(initialValue);
    }

    function handler(e: StorageEvent) {
      if (e.key !== key) {
        return;
      }

      const lsi = localStorage.getItem(key);
      setValue(JSON.parse(lsi ?? ''));
    }

    window.addEventListener('storage', handler);

    return () => {
      window.removeEventListener('storage', handler);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, globalSetState]);

  const setValueWrap = useCallback(
    (value: T) => {
      try {
        setValue(value);
        const storeLocal = () => {
          localStorage.setItem(key, JSON.stringify(value));
          window?.dispatchEvent(new StorageEvent('storage', { key }));
        };
        if (!storageCondition) {
          storeLocal();
        } else if (storageCondition(value, localStorage.getItem(key))) {
          storeLocal();
        }
        globalSetState?.(value);
      } catch (e) {
        console.error(e);
      }
    },
    [key, globalSetState, storageCondition],
  );

  return [value, setValueWrap];
}
