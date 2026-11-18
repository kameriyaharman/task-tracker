import type { ReactNode } from 'react';
import { overdueLabel } from './format';

const paths: Record<string, string> = {
  dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  tasks: 'M9 11l3 3 8-8M20 12v7a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2h9',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 013-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 01-3 3H3',
  goal: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  megaphone: 'M3 11v2a1 1 0 001 1h3l5 4V6L7 10H4a1 1 0 00-1 1zM16 8a5 5 0 010 8M19 5a9 9 0 010 14',
  users: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2',
  calendar: 'M3 6a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2zM16 2v4M8 2v4M3 10h18',
  pin: 'M12 22s-7-6.2-7-12a7 7 0 1114 0c0 5.8-7 12-7 12zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  trophy: 'M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM17 5h3v2a3 3 0 01-3 3M7 5H4v2a3 3 0 003 3',
  chart: 'M3 3v18h18M7 15l4-4 3 3 6-6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.7 1.7 0 003 15H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1A1.7 1.7 0 009 4.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 001.2 2.9H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M20 6L9 17l-5-5',
  mic: 'M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4',
  clip: 'M21.4 11l-9.2 9.2a6 6 0 01-8.5-8.5l9.2-9.2a4 4 0 015.7 5.7l-9.2 9.2a2 2 0 01-2.8-2.8l8.5-8.5',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  download: 'M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3',
  whatsapp: 'M3 21l1.7-5A9 9 0 1112 21a9 9 0 01-4.3-1.1z',
};

export function Icon({ name, size = 16 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name] ?? ''} />
    </svg>
  );
}

import lotus from './lotus.svg';

export const Logo = ({ size = 40 }: { size?: number }) => <img src={lotus} alt="Keshav" width={size} height={size * 0.62} style={{ display: 'block' }} />;

/** Keshav Home Solution wordmark: lotus over KESHAV, HOME SOLUTION and the trade line, as on the brand board. */
export function Brand({ big, light = true }: { big?: boolean; light?: boolean }) {
  return (
    <div className={`brand${big ? ' big' : ''}${light ? '' : ' dark'}`}>
      <Logo size={big ? 74 : 40} />
      <b>KESHAV</b>
      <em>HOME SOLUTION</em>
      <small>CONSTRUCTION SOLUTION · HARDWARE · PAINT · ELECTRICAL</small>
    </div>
  );
}

const palette = ['#A8722C', '#6B3A1C', '#B5562F', '#7A6A2E', '#2F6B5E', '#8C5A22', '#5A3820', '#9C4A3A'];
export const initialsOf = (name = '') =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

export function Avatar({ name, initials, lg }: { name?: string; initials?: string; lg?: boolean }) {
  const i = initials || initialsOf(name);
  const c = palette[(i.charCodeAt(0) + (i.charCodeAt(1) || 0)) % palette.length];
  return <span className={`av${lg ? ' lg' : ''}`} style={{ background: c }}>{i}</span>;
}

export function Person({ name, sub, initials }: { name: string; sub?: ReactNode; initials?: string }) {
  return (
    <div className="person">
      <Avatar name={name} initials={initials} />
      <div>
        <div>{name}</div>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  );
}

const statusText: Record<string, string> = {
  not_started: 'Not started', in_progress: 'In progress', done: 'Done', cancelled: 'Cancelled', overdue: 'Overdue',
  present: 'Present', late: 'Late', field: 'Field', leave: 'Leave', absent: 'Absent', not_punched: 'Not punched',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected', on_track: 'On track', at_risk: 'At risk', behind: 'Behind',
  inside: 'Inside', travelling: 'Travelling', visit: 'Visit',
};

export function Badge({ s, children }: { s: string; children?: ReactNode }) {
  return <span className={`badge ${s}`}>{children ?? statusText[s] ?? s}</span>;
}

export function TaskStatus({ t }: { t: { display_status: string; overdue_minutes: number } }) {
  return t.display_status === 'overdue' ? <Badge s="overdue">Overdue {overdueLabel(t.overdue_minutes)}</Badge> : <Badge s={t.display_status} />;
}

export const Pri = ({ p }: { p: string }) => <span className={`pri ${p}`}>{p[0].toUpperCase() + p.slice(1)}</span>;

export function Drawer({ title, onClose, children, modal }: { title: ReactNode; onClose: () => void; children: ReactNode; modal?: boolean }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={modal ? 'modal-c' : 'drawer'}>
        <h2>
          {title}
          <button className="x" onClick={onClose} aria-label="Close">×</button>
        </h2>
        {children}
      </div>
    </div>
  );
}

export const Loading = () => <div className="empty">Loading…</div>;
export const ErrorBox = ({ msg }: { msg: string | null }) => (msg ? <div className="error">{msg}</div> : null);
export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function Bar({ pct }: { pct: number }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} /></div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}
