import { api, setToken, clearToken, getToken } from './client';
import type { AuthPayload, LoginResponse } from '../types/api';

// Login real: POST /users (nombre no convencional, así está en el backend).
export async function login(email: string, password: string): Promise<AuthPayload> {
  const res = await api.post<LoginResponse>('/users', { email, password }, { auth: false });
  if (!res?.token) throw new Error('El servidor no devolvió un token');
  setToken(res.token);
  const payload = decodeToken(res.token);
  if (!payload) {
    clearToken();
    throw new Error('Token inválido recibido del servidor');
  }
  return payload;
}

export function logout() {
  clearToken();
}

export function currentAuth(): AuthPayload | null {
  const token = getToken();
  if (!token) return null;
  return decodeToken(token);
}

function decodeToken(token: string): AuthPayload | null {
  try {
    const [, payloadB64] = token.split('.');
    const json = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(json);
    if (!parsed?.id) return null;
    return {
      id: parsed.id,
      company_id: parsed.company_id,
      rol: parsed.rol ?? null,
      nombre: parsed.nombre ?? null,
      nombreEmpresa: parsed.nombreEmpresa ?? null,
    };
  } catch {
    return null;
  }
}
