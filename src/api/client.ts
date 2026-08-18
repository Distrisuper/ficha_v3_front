const API_BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

const TOKEN_KEY = 'ficha_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  /** Código estable del back (ver ErrorCode). Permite ramificar sin mirar el texto. */
  code?: string;
  /** Detalle seguro del back (ej. el remito duplicado en FACTURA_ALREADY_LOADED). */
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Handler global de sesión vencida.
 *
 * Antes un 401 a mitad de sesión sólo borraba el token y **no avisaba a nadie**: el
 * estado `auth` del AuthContext seguía poblado (se decodifica del token al montar),
 * así que la app se veía logueada y toda acción posterior fallaba con el mensaje
 * crudo del back. El usuario quedaba trabado sin entender por qué, y sólo volvía al
 * login recargando la página o esperando la próxima reconexión del SSE — hasta 30
 * minutos después.
 *
 * Lo registra AuthProvider. Vive acá y no en el context porque el 401 lo detecta
 * `request()`, que no puede usar hooks.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

interface RequestOptions extends RequestInit {
  auth?: boolean; // default true
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401) {
    clearToken();
    // Un solo 401 en cualquier request devuelve al login. Sin esto la app seguía
    // "logueada" con el token ya borrado, fallando en cada acción.
    onUnauthorized?.();
  }

  if (!res.ok) {
    let message = `Error ${res.status} en ${path}`;
    let code: string | undefined;
    let details: unknown;
    try {
      const body = await res.json();
      message = body?.message || message;
      code = body?.code;
      details = body?.details;
    } catch {
      // sin body json, mantenemos el mensaje genérico
    }
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message, code, details);
  }

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 204 || !contentType.includes('application/json')) {
    // `as unknown as T`: con strictNullChecks, `undefined` ya no es comparable con
    // un `T` sin constraint y el cast directo es TS2352.
    //
    // Esto sigue siendo una firma que miente: un 204 o un 200 no-JSON devuelve
    // undefined mientras el tipo promete `T`. Cada llamador lo compensa a mano
    // (`Array.isArray` en remitos.ts, `if (!fresco)` en DataContext). Lo correcto es
    // firmar `Promise<T | undefined>`, pero eso obliga a tocar los ~20 call sites.
    return undefined as unknown as T;
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  postForm: <T>(path: string, form: FormData, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: form }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...options?.headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, options?: RequestOptions) => request<T>(path, { ...options, method: 'DELETE' }),
};

// sseUrl() se eliminó junto con el stream por job. El JWT ya no viaja nunca por
// query string: el stream global usa un ticket de un solo uso (ver api/events.ts).

export { API_BASE };
