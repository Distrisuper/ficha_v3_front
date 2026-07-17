import { useCallback, useState } from 'react';

/**
 * Booleano persistido en sessionStorage (dura mientras viva la pestaña/sesión del navegador).
 * Soporta updates directos y funcionales, igual que useState.
 */
export function useSessionBoolean(
  key: string,
  initial: boolean,
): [boolean, (v: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(() => {
    try {
      const raw = sessionStorage.getItem(key);
      return raw === null ? initial : raw === '1';
    } catch {
      return initial;
    }
  });

  const update = useCallback(
    (v: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: boolean) => boolean)(prev) : v;
        try {
          sessionStorage.setItem(key, next ? '1' : '0');
        } catch {
          // sessionStorage no disponible: seguimos solo en memoria
        }
        return next;
      });
    },
    [key],
  );

  return [value, update];
}
