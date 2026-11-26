const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const p2 = (n: number) => String(n).padStart(2, '0');
/** DD-MM-YYYY (the format used everywhere in the app). Accepts Date, 'YYYY-MM-DD' or 'YYYY-MM-DD HH:MM:SS'. */
export const dmy = (s?: string | Date | null) => {
  const d = s instanceof Date ? s : s ? new Date(String(s).length === 10 ? `${s}T00:00` : String(s).replace(' ', 'T')) : null;
  return d && !isNaN(d.getTime()) ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}` : '—';
};
/** DD-MM-YYYY h:mm AM */
export const dmyt = (s?: string | Date | null) => {
  const d = s instanceof Date ? s : s ? new Date(String(s).replace(' ', 'T')) : null;
  return d && !isNaN(d.getTime()) ? `${dmy(d)} ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}` : '—';
};
/** 'DD-MM-YYYY' (or D-M-YYYY, / or .) -> 'YYYY-MM-DD'; '' if not a date */
export const ymd = (s: string) => {
  const m = s.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) return '';
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = new Date(+y, +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? `${y}-${p2(+m[2])}-${p2(+m[1])}` : '';
};

export const parseDate = (s?: string | null) => (s ? new Date(s.replace(' ', 'T')) : null);

export function dueLabel(s?: string | null): string {
  const d = parseDate(s);
  if (!d) return 'No due date';
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: d.getMinutes() ? '2-digit' : undefined }).replace(':00', '');
  if (sameDay(d, now)) return `Today ${time}`;
  if (sameDay(d, tomorrow)) return `Tomorrow ${time}`;
  return dmy(d);
}

export const timeOf = (s?: string | null) =>
  parseDate(s)?.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) ?? '—';

export const dateOf = (s?: string | null) => dmy(s);

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
