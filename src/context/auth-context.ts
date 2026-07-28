import { createContext, useContext } from 'react';
import type { AuthPayload, Empresa } from '../types/api';

export interface AuthContextValue {
  auth: AuthPayload | null;
  /** Empresa del usuario logueado. Llega de GET /users/me, no del token:
   *  null mientras la request está en vuelo o si falló. */
  empresa: Empresa | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
