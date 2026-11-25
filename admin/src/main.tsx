import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import './styles.css';
import 'leaflet/dist/leaflet.css';
import { AuthProvider, useAuth } from './auth';
import Layout, { erpNav } from './Layout';
import Login from './pages/Login';
import { PublicCard, PublicDoc } from './pages/Public';
import Business from './erp/Business';
import Dashboard from './pages/Dashboard';
import Tasks from './pages/Tasks';
import Recurring from './pages/Recurring';
import Templates from './pages/Templates';
import Knowledge from './pages/Knowledge';
import Goals from './pages/Goals';
import Campaigns from './pages/Campaigns';
import Employees from './pages/Employees';
import Attendance from './pages/Attendance';
import Leave from './pages/Leave';
import Location from './pages/Location';
import Performance from './pages/Performance';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import { Loading } from './ui';
import { MetaProvider, useMeta } from './erp/common';
import BusinessDashboard from './erp/BusinessDashboard';
import Approvals from './erp/Approvals';
import Masters from './erp/Masters';
import { GrnDetail, GrnList, PurchaseDetail, PurchaseList } from './erp/Purchase';
import Stock from './erp/Stock';
import { SalesDetail, SalesList } from './erp/Sales';
import Accounts, { Recovery } from './erp/Accounts';
import { Complaints, Deliveries, Expenses, Returns } from './erp/Operations';
import { AccessControl, ErpReports, TallySync, Workflows } from './erp/Control';

/** Boss & managers land on the team dashboard; office staff on their first showroom page. */
function Home() {
  const { me } = useAuth();
  const { meta } = useMeta();
  if (me?.role !== 'employee') return <Dashboard />;
  if (!meta) return <Loading />;
  const first = erpNav.flatMap((g) => g.items).find(([, , , mod]) => mod && mod !== 'boss_or_manager' && mod !== 'tally' && meta.perms?.[mod]);
  return <Navigate to={first ? first[0] : '/erp/expenses'} replace />;
}

function Gate() {
  const { me, ready } = useAuth();
  // public pages opened by customers from WhatsApp — no login
  const path = window.location.pathname.replace(import.meta.env.BASE_URL.replace(/\/$/, ''), '');
  const pub = path.match(/^\/(p|card)\/([a-f0-9]+)/);
  if (pub) return pub[1] === 'p' ? <PublicDoc token={pub[2]} /> : <PublicCard token={pub[2]} />;
  if (!ready) return <Loading />;
  if (!me) return <Login />;
  return (
    <MetaProvider>
    <Routes>
      <Route element={<Layout />}>
        <Route path="erp" element={<BusinessDashboard />} />
        <Route path="erp/approvals" element={<Approvals />} />
        <Route path="erp/business" element={<Business />} />
        <Route path="erp/masters" element={<Masters />} />
        <Route path="erp/masters/:tab" element={<Masters />} />
        <Route path="erp/purchase" element={<PurchaseList />} />
        <Route path="erp/purchase/:id" element={<PurchaseDetail />} />
        <Route path="erp/grn" element={<GrnList />} />
        <Route path="erp/grn/:id" element={<GrnDetail />} />
        <Route path="erp/stock" element={<Stock />} />
        <Route path="erp/sales" element={<SalesList />} />
        <Route path="erp/sales/:id" element={<SalesDetail />} />
        <Route path="erp/deliveries" element={<Deliveries />} />
        <Route path="erp/accounts" element={<Accounts />} />
        <Route path="erp/recovery" element={<Recovery />} />
        <Route path="erp/returns" element={<Returns />} />
        <Route path="erp/expenses" element={<Expenses />} />
        <Route path="erp/complaints" element={<Complaints />} />
        <Route path="erp/workflows" element={<Workflows />} />
        <Route path="erp/access" element={<AccessControl />} />
        <Route path="erp/reports" element={<ErpReports />} />
        <Route path="erp/tally" element={<TallySync />} />
        <Route index element={<Home />} />
        <Route path="tasks" element={<Tasks />} />
        <Route path="recurring" element={<Recurring />} />
        <Route path="templates" element={<Templates />} />
        <Route path="knowledge" element={<Knowledge />} />
        <Route path="goals" element={<Goals />} />
        <Route path="campaigns" element={<Campaigns />} />
        <Route path="employees" element={<Employees />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="leave" element={<Leave />} />
        <Route path="location" element={<Location />} />
        <Route path="performance" element={<Performance />} />
        <Route path="reports" element={<Reports />} />
        <Route path="settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Route>
    </Routes>
    </MetaProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
