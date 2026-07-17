import { useState, useCallback } from 'react';

export function useLocalStorage(key: string, initial = ''): [string, (v: string) => void, () => void] {
  const [value, setValue] = useState<string>(() => localStorage.getItem(key) ?? initial);

  const update = useCallback(
    (v: string) => {
      setValue(v);
      if (v) localStorage.setItem(key, v);
      else localStorage.removeItem(key);
    },
    [key],
  );

  const clear = useCallback(() => {
    setValue('');
    localStorage.removeItem(key);
  }, [key]);

  return [value, update, clear];
}
