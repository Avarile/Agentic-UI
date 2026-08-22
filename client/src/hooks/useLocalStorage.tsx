// A `useState` that persists to localStorage and syncs across tabs.
//
// The simple variant: JSON-serialized, and a `storage` event listener so every
// tab holding the same key sees a change. Use it for state genuinely local to a
// component that should survive a reload — anything shared belongs in `~/store`.
//
// Note the near-duplicate: useLocalStorageAlt.tsx exports a hook with the *same*
// name and a superset of this signature (a global setter and a write predicate).
// They are separate because call sites depend on this one's simpler, always-write
// behaviour. Import by path and check which you mean.

import { useEffect, useState } from 'react';

export default function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const item = localStorage.getItem(key);

    if (!item) {
      localStorage.setItem(key, JSON.stringify(defaultValue));
    }

    setValue(item ? JSON.parse(item) : defaultValue);

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
  }, []);

  const setValueWrap = (value: T) => {
    try {
      setValue(value);

      localStorage.setItem(key, JSON.stringify(value));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new StorageEvent('storage', { key }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  return [value, setValueWrap];
}
