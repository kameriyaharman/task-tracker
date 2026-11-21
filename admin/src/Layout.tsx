import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from './auth';
import { useApi } from './hooks';
import { Avatar, Brand, Drawer, Icon } from './ui';
import { ago } from './format';
import { api } from './api';
import { useMeta } from './erp/common';

type NavItem = [string, string, string, string?]; // path, label, icon, ERP module needed
const erpNav: { group: string; items: NavItem[] }[] = [
  { group: 'SHOWROOM', items: [['/erp', 'Business dashboard', 'chart', 'reports'], ['/erp/sales', 'Sales & bills', 'receipt', 'sales'], ['/erp/deliveries', 'Deliveries', 'truck', 'delivery'], ['/erp/recovery', 'Recovery (udhari)', 'phone', 'recovery'], ['/erp/complaints', 'Complaints', 'alert', 'complaints']] },
  { group: 'STOCK & PURCHASE', items: [['/erp/purchase', 'Purchase orders', 'cart', 'purchase'], ['/erp/grn', 'Goods received', 'box', 'inventory'], ['/erp/stock', 'Stock', 'box', 'inventory'], ['/erp/returns', 'Returns', 'undo', 'returns'], ['/erp/masters/products', 'Products & parties', 'tag', 'masters']] },
  { group: 'MONEY', items: [['/erp/accounts', 'Accounts', 'wallet', 'accounts'], ['/erp/expenses', 'Expenses', 'receipt']] },
  { group: 'CONTROL', items: [['/erp/approvals', 'Approvals', 'check'], ['/erp/workflows', 'Workflows', 'flow'], ['/erp/access', 'Roles & approval rules', 'shield'], ['/erp/reports', 'Business reports', 'chart', 'reports'], ['/erp/tally', 'Tally sync', 'sync', 'tally']] },
];
const nav: { group: string; items: NavItem[] }[] = [
  { group: 'WORK', items: [['/', 'Dashboard', 'dashboard'], ['/tasks', 'Tasks', 'tasks'], ['/recurring', 'Recurring tasks', 'repeat'], ['/goals', 'Goals', 'goal'], ['/campaigns', 'Campaigns', 'megaphone']] },
  { group: 'PEOPLE', items: [['/employees', 'Employees', 'users'], ['/attendance', 'Attendance & timesheets', 'clock'], ['/leave', 'Leave', 'calendar'], ['/location', 'Live location', 'pin'], ['/performance', 'Performance & rewards', 'trophy']] },
  { group: 'INSIGHTS', items: [['/reports', 'Reports', 'chart'], ['/settings', 'Settings', 'settings']] },
];

export default function Layout() {
  const { logout, me } = useAuth();
  const { meta } = useMeta();
  const allowed = (mod?: string) => !mod || (mod === 'tally' ? me?.role === 'owner' : !!meta?.perms?.[mod]);
  const groups = [...erpNav, ...nav].map((g) => ({ ...g, items: g.items.filter(([, , , mod]) => allowed(mod)) })).filter((g) => g.items.length);
  return (
    <div className="shell">
      <aside className="side">
        <Brand />
        <nav className="nav">
          {groups.map((g) => (
            <div key={g.group}>
              <div className="nav-group">{g.group}</div>
              {g.items.map(([to, label, icon]) => (
                <NavLink key={to} to={to} end={to === '/' || to === '/erp'}>
                  <Icon name={icon} /> {label}
                  {to === '/erp/approvals' && !!meta?.pending_approvals && <i className="nav-badge">{meta.pending_approvals}</i>}
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
