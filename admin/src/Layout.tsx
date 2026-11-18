import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { useApi } from './hooks';
import { Avatar, Drawer, Icon, Logo } from './ui';
import { ago } from './format';
import { api } from './api';

const nav: { group: string; items: [string, string, string, boolean?][] }[] = [
  { group: 'WORK', items: [['/', 'Dashboard', 'dashboard'], ['/tasks', 'Tasks', 'tasks'], ['/recurring', 'Recurring tasks', 'repeat'], ['/goals', 'Goals', 'goal'], ['/campaigns', 'Campaigns', 'megaphone']] },
  { group: 'PEOPLE', items: [['/employees', 'Employees', 'users'], ['/attendance', 'Attendance & timesheets', 'clock'], ['/leave', 'Leave', 'calendar'], ['/location', 'Live location', 'pin'], ['/performance', 'Performance & rewards', 'trophy']] },
  { group: 'INSIGHTS', items: [['/reports', 'Reports', 'chart'], ['/settings', 'Settings', 'settings']] },
];

export default function Layout() {
  const { me, logout } = useAuth();
  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <Logo />
          <div><b>WorkTrack</b><small>TASKS · ATTENDANCE · TEAM</small></div>
        </div>
        <div className="company">{me?.company_name} <span className="muted" style={{ color: '#aaa' }}>· {me?.company_code}</span></div>
        <nav className="nav">
          {nav.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map(([to, label, icon]) => (
                <NavLink key={to} to={to} end={to === '/'}>
                  <Icon name={icon} /> {label}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-group" />
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }}><Icon name="logout" /> Logout</a>
        </nav>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  );
}

/** Page header with search, primary action, notifications and avatar — matches the design's top bar. */
export function Topbar({ title, action, search, onSearch }: { title: string; action?: ReactNode; search?: string; onSearch?: (q: string) => void }) {
  const { me } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const n = useApi<{ items: any[]; unread: number }>('/notifications');
  return (
    <div className="topbar">
      <h1>{title}</h1>
      <input
        className="search" placeholder="Search tasks, people…" value={search ?? ''}
        onChange={(e) => (onSearch ? onSearch(e.target.value) : undefined)}
        onKeyDown={(e) => { if (!onSearch && e.key === 'Enter') nav(`/tasks?q=${encodeURIComponent((e.target as HTMLInputElement).value)}`); }}
      />
      {action}
      <div className="bell" onClick={() => setOpen(true)}>
        <Icon name="bell" />
        {!!n.data?.unread && <i>{n.data.unread}</i>}
      </div>
      <Avatar initials={me?.initials} />
      {open && (
        <Drawer title="Notifications" onClose={() => { setOpen(false); api('/notifications/read', { body: {} }).then(n.reload); }}>
          {n.data?.items.length ? n.data.items.map((x) => (
            <div key={x.id} className="list-item between">
              <div><div style={{ fontWeight: x.read_at ? 400 : 600 }}>{x.title}</div><div className="muted">{x.body}</div></div>
              <span className="muted">{ago(x.created_at)}</span>
            </div>
          )) : <div className="empty">You're all caught up</div>}
        </Drawer>
      )}
    </div>
  );
}
