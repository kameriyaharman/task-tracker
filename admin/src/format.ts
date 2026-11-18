const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

export const parseDate = (s?: string | null) => (s ? new Date(s.replace(' ', 'T')) : null);

export function dueLabel(s?: string | null): string {
  const d = parseDate(s);
  if (!d) return 'No due date';
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }).replace(':00', '');
  if (sameDay(d, now)) return `Today ${time}`;
  if (sameDay(d, tomorrow)) return 'Tomorrow';
  const diff = (d.getTime() - now.getTime()) / 86400000;
  if (diff > 0 && diff < 6) return d.toLocaleDateString('en-IN', { weekday: 'short' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const timeOf = (s?: string | null) =>
  parseDate(s)?.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) ?? '—';

export const dateOf = (s?: string | null) => parseDate(s)?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) ?? '—';

export function minutes(m: number): string {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? `${h}h${r ? ` ${r}m` : ''}` : `${r}m`;
}

export function overdueLabel(min: number): string {
  if (min < 60) return `${min}m`;
  if (min < 1440) return `${Math.floor(min / 60)}h`;
  return `${Math.floor(min / 1440)}d`;
}

export const inr = (n: number) =>
  n >= 1e7 ? `₹${(n / 1e7).toFixed(1).replace(/\.0$/, '')} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1).replace(/\.0$/, '')} L` : `₹${n.toLocaleString('en-IN')}`;

export const ago = (s: string) => {
  const d = parseDate(s)!;
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 60) return `${Math.max(1, m)}m`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
};

/** value for <input type="datetime-local"> */
export const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export const thisMonth = () => toLocalInput(new Date()).slice(0, 7);
export const today = () => toLocalInput(new Date()).slice(0, 10);
