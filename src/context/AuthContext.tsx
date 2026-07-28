import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, currentAuth } from '../api/auth';
import { usersApi } from '../api/users';
import { ApiError } from '../api/client';
import type { AuthPayload, Empresa } from '../types/api';
import { AuthContext, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthPayload | null>(() => currentAuth());
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // La empresa no viaja en el token (es mutable y el JWT vive días), así que se
  // pide por GET /users/me cada vez que hay sesión: al montar con un token ya
  // guardado y después de cada login.
  useEffect(() => {
    if (!auth) {
      setEmpresa(null);
      return;
    }
    let cancelled = false;
    usersApi
      .me()
      .then((me) => {
        if (!cancelled) setEmpresa(me.empresa);
      })
      .catch((e) => {
        if (cancelled) return;
        // 401: el token expiró o la empresa se desactivó. client.ts ya borró el
        // token, así que sólo hay que bajar el estado para volver al Login.
        if (e instanceof ApiError && e.status === 401) setAuth(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth?.id]);

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
      empresa,
      loading,
      error,
      login: async (email: string, password: string) => {
        setLoading(true);
        setError(null);
        try {
          const payload = await apiLogin(email, password);
          setAuth(payload);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo iniciar sesión');
          throw e;
        } finally {
          setLoading(false);
        }
      },
      logout: () => {
        apiLogout();
        setAuth(null);
        setEmpresa(null);
      },
    }),
    [auth, empresa, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
