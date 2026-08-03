import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, currentAuth } from '../api/auth';
import { usersApi } from '../api/users';
import { ApiError, setUnauthorizedHandler } from '../api/client';
import type { AuthPayload, Empresa } from '../types/api';
import { AuthContext, type AuthContextValue } from './auth-context';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthPayload | null>(() => currentAuth());
  const [empresa, setEmpresa] = useState<Empresa | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Un 401 en CUALQUIER request cierra la sesión. Es el único lugar del front que
  // sabe cómo bajar el estado de auth, y `request()` no puede usar hooks: de ahí el
  // registro de un handler en vez de un import directo.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuth(null);
      setEmpresa(null);
      setError('Tu sesión expiró. Volvé a iniciar sesión.');
    });
    return () => setUnauthorizedHandler(null);
  }, []);

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
        // El 401 ya lo maneja el handler global de arriba. Acá sólo importa que un
        // fallo distinto (500, red) no deje `empresa` en null para siempre y sin
        // ninguna señal: el nombre de la empresa desaparecía del header sin
        // explicación.
        if (e instanceof ApiError && e.status === 401) return;
        setError('No se pudieron cargar los datos de la empresa.');
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
