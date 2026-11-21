import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

export const API_URL: string = (process.env.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as any)?.apiUrl || '').replace(/\/$/, '');

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const loadToken = async () => (token = await SecureStore.getItemAsync('wt_token'));
export const saveToken = async (t: string | null) => {
  token = t;
  if (t) await SecureStore.setItemAsync('wt_token', t);
  else await SecureStore.deleteItemAsync('wt_token');
};
export const getToken = () => token;
export const setUnauthorizedHandler = (fn: () => void) => (onUnauthorized = fn);

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** A file picked from camera / gallery / recorder, ready for multipart upload. */
export type UploadFile = { uri: string; name: string; type: string };

export async function api<T = any>(
  path: string,
  opts: { method?: string; body?: Record<string, any> | FormData; query?: Record<string, any> } = {},
): Promise<T> {
  const qs = Object.entries(opts.query ?? {})
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: any;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}${qs ? `?${qs}` : ''}`, { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body });
  } catch (e) {
    try { require('./diag').diag('fetch-failed', `${opts.method ?? (body ? 'POST' : 'GET')} ${path} ${(e as Error)?.message ?? e}`); } catch { /* ignore */ }
    throw new ApiError(0, 'No internet connection');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/auth')) onUnauthorized?.();
  if (!res.ok) throw new ApiError(res.status, data.error || `Something went wrong (${res.status})`);
  return data as T;
}

/** Build multipart body: plain fields + files (React Native accepts {uri,name,type} objects). */
export function form(fields: Record<string, any>, files: Record<string, UploadFile | UploadFile[] | null | undefined> = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    fd.append(k, typeof v === 'object' ? JSON.stringify(v) : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  });
  Object.entries(files).forEach(([k, f]) => {
    if (!f) return;
    (Array.isArray(f) ? f : [f]).forEach((x) => fd.append(Array.isArray(f) ? `${k}[]` : k, x as any));
  });
  return fd;
}

export const fileUrl = (id: number) => `${API_URL}/files/${id}?token=${encodeURIComponent(token ?? '')}`;
