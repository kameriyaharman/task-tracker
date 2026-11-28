/**
 * Crash reporting with no native dependencies (so it works even if a native module fails to load):
 *  - sends start-up breadcrumbs and any JS error to POST /client-log on the API
 *  - turns fatal JS errors into an on-screen error instead of closing the app
 * Must be imported before anything else (see index.js).
 */
import { Platform } from 'react-native';

const API: string = (process.env.EXPO_PUBLIC_API_URL || 'https://keshavkunj.com/api').replace(/\/$/, '');
const sid = Math.random().toString(36).slice(2, 8);
const started = Date.now();

export function diag(event: string, detail?: unknown) {
  try {
    const text = detail instanceof Error ? `${detail.message}\n${detail.stack ?? ''}` : detail === undefined ? undefined : String(detail);
    fetch(`${API}/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid, event, ms: Date.now() - started, os: Platform.OS, osv: String(Platform.Version), detail: text?.slice(0, 4000) }),
    }).catch(() => {});
  } catch {
    /* never throw from the reporter */
  }
}

type Listener = (e: Error) => void;
let listener: Listener | null = null;
let pending: Error | null = null;

/** Root layout subscribes to show a fatal error on screen. */
export function onFatal(fn: Listener) {
  listener = fn;
  if (pending) fn(pending);
}

const g = globalThis as any;
if (g.ErrorUtils?.setGlobalHandler) {
  const previous = g.ErrorUtils.getGlobalHandler?.();
  g.ErrorUtils.setGlobalHandler((error: any, isFatal?: boolean) => {
    const e = error instanceof Error ? error : new Error(String(error));
    diag(isFatal ? 'fatal' : 'error', e);
    if (!isFatal) return;
    if (listener) listener(e);
    else {
      pending = e;
      // Nothing can render yet — let React Native handle it as before, after the report had a moment to leave.
      setTimeout(() => previous?.(error, isFatal), 1500);
    }
  });
}

diag('boot');
