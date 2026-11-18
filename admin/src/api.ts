export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') || '/api';

const TOKEN_KEY = 'wt_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Body = Record<string, unknown> | FormData | undefined;

export async function api<T = any>(path: string, opts: { method?: string; body?: Body; query?: Record<string, unknown> } = {}): Promise<T> {
  const url = new URL(API_URL + path, window.location.origin);
  Object.entries(opts.query ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && url.searchParams.set(k, String(v)));
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth')) window.location.reload();
  }
  if (!res.ok) throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  return data as T;
}

/** Link that downloads a CSV / file (token travels as query param because <a> can't send headers). */
export const downloadUrl = (path: string, query: Record<string, unknown> = {}) => {
  const url = new URL(API_URL + path, window.location.origin);
  Object.entries({ ...query, token: getToken() }).forEach(([k, v]) => v != null && url.searchParams.set(k, String(v)));
  return url.toString();
};
