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
    const bytes = atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'));

    // TextDecoder y no el resultado directo de atob: atob devuelve bytes Latin-1,
    // así que un `nombre` con acentos ("José") salía mojibake en el header y en
    // Configuración.
    const json = new TextDecoder().decode(
      Uint8Array.from(bytes, (c) => c.charCodeAt(0)),
    );

    const parsed = JSON.parse(json);
    if (!parsed?.id) return null;

    // El `exp` se ignoraba: un token vencido hace días devolvía un payload válido,
    // la app arrancaba "logueada" y TODA request daba 401. Descartarlo acá es lo que
    // hace que el usuario vea el login en vez de una app rota.
    if (typeof parsed.exp === 'number' && parsed.exp * 1000 <= Date.now()) {
      return null;
    }

    return {
      id: parsed.id,
      company_id: parsed.company_id,
      rol: parsed.rol ?? null,
      nombre: parsed.nombre ?? null,
    };
  } catch {
    return null;
  }
}
