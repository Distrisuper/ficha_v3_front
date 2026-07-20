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
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
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
  console.log("mandamos a ", API_BASE, path, rest, finalHeaders);

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers: finalHeaders });

  if (res.status === 401) {
    clearToken();
  }

  if (!res.ok) {
    let message = `Error ${res.status} en ${path}`;
    try {
      const body = await res.json();
      message = body?.message || message;
    } catch {
      // sin body json, mantenemos el mensaje genérico
    }
    throw new ApiError(res.status, Array.isArray(message) ? message.join(', ') : message);
  }

  const contentType = res.headers.get('content-type') || '';
  if (res.status === 204 || !contentType.includes('application/json')) {
    return undefined as T;
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

export function sseUrl(jobId: string): string {
  return `${API_BASE}/facturas/${jobId}/events`;
}

export { API_BASE };
