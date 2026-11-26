export const parseDate = (s?: string | null) => (s ? new Date(s.replace(' ', 'T')) : null);

export const timeOf = (s?: string | null) => {
  const d = parseDate(s);
  if (!d) return '';
  let h = d.getHours();
  const m = d.getMinutes();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}${m ? `:${String(m).padStart(2, '0')}` : ''} ${ap}`;
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const p2 = (n: number) => String(n).padStart(2, '0');
/** DD-MM-YYYY — the date format used everywhere */
export const dateOf = (s?: string | null | Date) => {
  const d = s instanceof Date ? s : s ? new Date(s.length === 10 ? `${s}T00:00` : s.replace(' ', 'T')) : null;
  return d && !isNaN(d.getTime()) ? `${p2(d.getDate())}-${p2(d.getMonth() + 1)}-${d.getFullYear()}` : '';
};
export const dmy = dateOf;
/** 'DD-MM-YYYY' (also / or .) -> 'YYYY-MM-DD', '' if invalid */
export const ymd = (s: string) => {
  const m = (s ?? '').trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (!m) return '';
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = new Date(+y, +m[2] - 1, +m[1]);
  return d.getDate() === +m[1] && d.getMonth() === +m[2] - 1 ? `${y}-${p2(+m[2])}-${p2(+m[1])}` : '';
};
export const dayDate = (d: Date) => `${DAYS[d.getDay()]}, ${dateOf(d)}`;
export const monthName = (d: Date) => ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getMonth()];

export function dueLabel(s?: string | null, t: (k: string) => string = (k) => k) {
  const d = parseDate(s);
  if (!d) return '';
  const now = new Date();
  const tom = new Date(now); tom.setDate(now.getDate() + 1);
  if (d.toDateString() === now.toDateString()) return `${t('today')} ${timeOf(s)}`;
  if (d.toDateString() === tom.toDateString()) return `${t('tomorrow')} ${timeOf(s)}`;
  return `${dateOf(d)} ${timeOf(s)}`;
}

export const hm = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
};

export const overdueLabel = (min: number) => (min < 60 ? `${min}m` : min < 1440 ? `${Math.floor(min / 60)}h` : `${Math.floor(min / 1440)}d`);

export const ago = (s: string) => {
  const m = Math.round((Date.now() - parseDate(s)!.getTime()) / 60000);
  return m < 60 ? `${Math.max(1, m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d`;
};

export const sqlDate = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const sqlDateTime = (d: Date) => `${sqlDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`;

export const initials = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const first = (name = '') => name.split(' ')[0];
