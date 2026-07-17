import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { login as apiLogin, logout as apiLogout, currentAuth } from '../api/auth';
import type { AuthPayload } from '../types/api';

interface AuthContextValue {
  auth: AuthPayload | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthPayload | null>(() => currentAuth());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = useMemo<AuthContextValue>(
    () => ({
      auth,
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
      },
    }),
    [auth, loading, error],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
