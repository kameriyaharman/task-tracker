import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { KbForm } from '../pages/Knowledge';
import {
  ApprovalTrail, DataTable, Files, History, ItemsEditor, Kpi, NoAccess, Select, St, Tabs, can, d8, dt, linesBody, qty, rs, useAction, useList, useMeta, useProducts, type Line,
} from './common';

// ───────── Deliveries ─────────
export function Deliveries() {
  const { meta } = useMeta();
  const [sp] = useSearchParams();
  const [status, setStatus] = useState('open');
  const list = useApi<any[]>('/erp/deliveries', { status });
  const [openId, setOpenId] = useState<number | null>(sp.get('open') ? Number(sp.get('open')) : null);
  if (meta && !can(meta, 'delivery')) return <NoAccess />;
  return (
    <>
      <Topbar title="Deliveries" />
      <Tabs value={status} onChange={setStatus} tabs={[['open', 'To deliver'], ['delivered', 'Delivered'], ['partial', 'Partial'], ['failed', 'Failed'], ['', 'All']]} />
      <DataTable rows={list.data} onRow={(r) => setOpenId(r.id)} empty="No deliveries" cols={[
        ['No.', (r) => <b style={{ fontWeight: 500 }}>{r.delivery_no}</b>], ['Bill', (r) => r.invoice_no], ['Customer', (r) => <>{r.customer_name}<div className="muted">{r.customer_mobile}</div></>],
        ['Address', (r) => r.address ?? '—'], ['Delivery person', (r) => r.assigned_name ?? <span style={{ color: 'var(--red)' }}>Not assigned</span>], ['Vehicle', (r) => r.vehicle ?? '—'],
        ['Payment', (r) => (r.payment_mode === 'credit' ? <St s="credit" /> : Number(r.paid_amount) >= Number(r.invoice_total) ? 'Paid' : 'Collect')], ['Status', (r) => <St s={r.status} />],
      ]} />
      {openId && <DeliveryDrawer id={openId} onClose={() => { setOpenId(null); list.reload(); }} />}
    </>
  );
}

function DeliveryDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { meta } = useMeta();
  const { data: d, reload } = useApi<any>(`/erp/deliveries/${id}`);
  const [f, setF] = useState<any>({});
  const [done, setDone] = useState<any>(null);
  const a = useAction();
  useEffect(() => { if (d) setF({ assigned_to: d.assigned_to ?? '', vehicle: d.vehicle ?? '', address: d.address ?? '' }); }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!d) return null;
  const w = can(meta, 'delivery', true);
  const open = ['pending', 'packed', 'dispatched'].includes(d.status);
  const status = (s: string, extra: any = {}) => a.run(async () => {
    const fd = new FormData();
    fd.append('status', s);
    Object.entries(extra).forEach(([k, v]) => { if (k !== 'photos' && v !== undefined && v !== null) fd.append(k, String(v)); });
    Array.from((extra.photos as FileList) ?? []).forEach((p) => fd.append('photos[]', p));
    await api(`/erp/deliveries/${id}/status`, { body: fd }); setDone(null); reload();
  });
  return (
    <Drawer title={`${d.delivery_no} · ${d.customer_name ?? ''}`} onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="between"><span>Bill {d.invoice_no} · {rs(d.invoice_total)}</span><St s={d.status} /></div>
      {d.otp_code && open && <div className="card" style={{ margin: '10px 0', padding: 10 }}>Customer delivery OTP: <b style={{ fontSize: 18, letterSpacing: 3 }}>{d.otp_code}</b> <span className="muted">— share with the customer; the delivery person must enter it.</span></div>}
      <table className="t"><tbody>{d.items.map((i: any) => <tr key={i.id}><td>{i.product_name}</td><td style={{ textAlign: 'right' }}>{qty(i.qty)} {i.unit}</td><td className="muted" style={{ textAlign: 'right' }}>delivered {qty(i.delivered_qty)}</td></tr>)}</tbody></table>
      {w && open && (
        <>
          <div className="grid g2" style={{ marginTop: 12 }}>
            <Field label="Delivery person"><Select value={f.assigned_to} onChange={(v) => setF({ ...f, assigned_to: v })} options={meta?.users ?? []} /></Field>
            <Field label="Vehicle"><input value={f.vehicle} onChange={(e) => setF({ ...f, vehicle: e.target.value })} /></Field>
          </div>
          <Field label="Address"><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button className="btn ghost" onClick={() => a.run(async () => { await api(`/erp/deliveries/${id}`, { method: 'PATCH', body: f }); reload(); })}>Save</button>
            {d.status === 'pending' && <button className="btn ghost" onClick={() => status('packed')}>Packed</button>}
            {['pending', 'packed'].includes(d.status) && <button className="btn ghost" onClick={() => status('dispatched')}>Out for delivery</button>}
            <button className="btn ok" onClick={() => setDone({ status: 'delivered', otp: '', receiver_name: '' })}>Delivered</button>
            <button className="btn danger" onClick={() => setDone({ status: 'failed', failure_reason: '' })}>Failed</button>
          </div>
        </>
      )}
      {done && (
        <div className="card" style={{ marginTop: 12 }}>
          {done.status === 'delivered' ? (<>
            <Field label="Customer OTP"><input value={done.otp} onChange={(e) => setDone({ ...done, otp: e.target.value })} /></Field>
            <Field label="Received by"><input value={done.receiver_name} onChange={(e) => setDone({ ...done, receiver_name: e.target.value })} /></Field>
            <Field label="Photo (if no OTP)"><input type="file" accept="image/*" multiple onChange={(e) => setDone({ ...done, photos: e.target.files })} /></Field>
          </>) : <Field label="Why did it fail?"><input value={done.failure_reason} onChange={(e) => setDone({ ...done, failure_reason: e.target.value })} /></Field>}
          <button className="btn" disabled={a.busy} onClick={() => status(done.status, done)}>Confirm</button>
        </div>
      )}
      {d.failure_reason && <p className="muted">Failure: {d.failure_reason}</p>}
      {d.delivered_at && <p className="muted">Delivered {dt(d.delivered_at)}{d.receiver_name ? ` to ${d.receiver_name}` : ''} · {+d.otp_verified ? 'OTP verified ✓' : 'photo proof'}</p>}
      <Files files={d.files} />
      <History rows={d.history} />
    </Drawer>
  );
}

// ───────── Returns ─────────
export function Returns() {
  const { meta } = useMeta();
  const [type, setType] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [pr, setPr] = useState(false);
  const list = useApi<any[]>('/erp/returns', { type });
  const nav = useNavigate();
  if (meta && !can(meta, 'returns')) return <NoAccess />;
  return (
    <>
      <Topbar title="Returns" action={can(meta, 'returns', true) ? <div className="row">
        <button className="btn ghost" onClick={() => nav('/erp/sales')}>Sales return (open the bill)</button>
        <button className="btn" onClick={() => setPr(true)}><Icon name="undo" /> Return to vendor</button>
      </div> : undefined} />
      <Tabs value={type} onChange={setType} tabs={[['', 'All'], ['sales', 'From customers'], ['purchase', 'To vendors']]} />
      <DataTable rows={list.data} onRow={(r) => setOpen(r.id)} cols={[
        ['No.', (r) => r.return_no], ['Date', (r) => d8(r.created_at)], ['Type', (r) => (r.type === 'sales' ? 'From customer' : 'To vendor')],
        ['Party', (r) => r.party_name], ['Against', (r) => r.ref_no ?? '—'], ['Reason', (r) => r.reason ?? ''], ['Amount', (r) => rs(r.total), 'r'], ['Status', (r) => <St s={r.status} />],
      ]} />
      {open && <ReturnDrawer id={open} onClose={() => setOpen(null)} />}
      {pr && <PurchaseReturnForm onClose={() => setPr(false)} onSaved={() => { setPr(false); list.reload(); }} />}
    </>
  );
}

function ReturnDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const { data: r } = useApi<any>(`/erp/returns/${id}`);
  if (!r) return null;
  return (
    <Drawer title={`${r.return_no}`} onClose={onClose}>
      <div className="between"><span>{r.reason}</span><St s={r.status} /></div>
      {r.reason_type && <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <span className="badge">Why: {r.reason_type.replace(/_/g, ' ')}</span>
        {r.responsible && <span className="badge overdue">Responsible: {r.responsible.replace(/_/g, ' ')}{r.responsible_name ? ` — ${r.responsible_name}` : ''}</span>}
      </div>}
      {r.context && <div className="muted" style={{ marginTop: 8 }}>Bill {r.context.doc_no} ({d8(r.context.doc_date)}) · customer {r.context.customer} · billed by {r.context.billed_by ?? '—'} · delivered by {r.context.delivered_by ?? '—'}{r.context.vehicle ? ` (${r.context.vehicle})` : ''}</div>}
      {r.files?.length > 0 && <div className="attach-list" style={{ marginTop: 10 }}>
        {r.files.map((f: any) => {
          const url = `/api/files/${f.id}?token=${localStorage.getItem('wt_token')}`;
          return f.kind === 'voice' || (f.mime ?? '').startsWith('audio') ? <div key={f.id} className="attach-chip voice">🎤<audio controls preload="none" src={url} /></div>
            : (f.mime ?? '').startsWith('video') ? <video key={f.id} controls preload="metadata" src={url} style={{ maxWidth: 260, borderRadius: 8 }} />
            : <a key={f.id} className="attach-chip" href={url} target="_blank" rel="noreferrer"><img src={url} alt="" /></a>;
        })}
      </div>}
      <table className="t" style={{ marginTop: 10 }}><tbody>{r.items.map((i: any) => <tr key={i.id}><td>{i.product_name}</td><td>{qty(i.qty)} {i.unit}</td><td>{+i.restock ? 'Restock' : 'Damaged'}</td><td style={{ textAlign: 'right' }}>{rs(i.amount, 2)}</td></tr>)}</tbody></table>
      <div className="totals"><b>Total {rs(r.total)}</b></div>
      <ApprovalTrail rows={r.approvals} /><History rows={r.history} />
    </Drawer>
  );
}

function PurchaseReturnForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { meta } = useMeta();
  const vendors = useList('vendors');
  const products = useProducts();
  const [f, setF] = useState<any>({ party_id: '', warehouse_id: '', reason: '' });
  const [lines, setLines] = useState<Line[]>([]);
  const a = useAction();
  return (
    <Drawer title="Return goods to vendor" wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="grid g2">
        <Field label="Vendor"><Select value={f.party_id} onChange={(v) => setF({ ...f, party_id: v })} options={vendors.data ?? []} placeholder="Choose" /></Field>
        <Field label="From godown"><Select value={f.warehouse_id} onChange={(v) => setF({ ...f, warehouse_id: v })} options={meta?.warehouses ?? []} placeholder="Default" /></Field>
      </div>
      <ItemsEditor lines={lines} setLines={setLines} products={products} priceKey="purchase_price" />
      <Field label="Reason"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <button className="btn" disabled={!f.party_id || !lines.length || !f.reason || a.busy} onClick={() => a.run(async () => { await api('/erp/returns', { body: { ...f, type: 'purchase', items: linesBody(lines) } }); onSaved(); })}>Save return</button>
    </Drawer>
  );
}

// ───────── Expenses ─────────
export function Expenses() {
  const { meta } = useMeta();
  const [status, setStatus] = useState('');
  const list = useApi<any>('/erp/expenses', { status });
  const [f, setF] = useState<any>(null);
  const a = useAction();
  const save = () => a.run(async () => {
    const fd = new FormData();
    Object.entries(f).forEach(([k, v]) => k !== 'bills' && v != null && fd.append(k, String(v)));
    Array.from((f.bills as FileList) ?? []).forEach((b) => fd.append('bills[]', b));
    await api('/erp/expenses', { body: fd }); setF(null); list.reload();
  });
  const total = (list.data?.items ?? []).filter((e: any) => e.status === 'approved').reduce((s: number, e: any) => s + Number(e.amount), 0);
  return (
    <>
      <Topbar title="Expenses" action={<button className="btn" onClick={() => setF({ category: list.data?.categories[0] ?? 'Other', amount: '', mode: 'cash', exp_date: new Date().toISOString().slice(0, 10), paid_to: '', notes: '' })}><Icon name="plus" /> Add expense</button>} />
      <Tabs value={status} onChange={setStatus} tabs={[['', 'All'], ['pending_approval', 'Waiting approval'], ['approved', 'Approved'], ['rejected', 'Rejected']]} />
      <DataTable rows={list.data?.items} cols={[
        ['No.', (r) => r.exp_no], ['Date', (r) => d8(r.exp_date)], ['Category', (r) => r.category], ['Paid to', (r) => r.paid_to ?? ''], ['Mode', (r) => <St s={r.mode} />],
        ['Bill', (r) => (Number(r.bills) ? '📎' : '')], ['Amount', (r) => rs(r.amount, 2), 'r'], ['Status', (r) => <St s={r.status} />], ['By', (r) => r.created_by_name],
      ]} />
      {can(meta, 'expenses') && <p className="muted" style={{ textAlign: 'right' }}>Approved in list: <b>{rs(total)}</b></p>}
      {f && (
        <Drawer title="Add expense" onClose={() => setF(null)} modal>
          <ErrorBox msg={a.err} />
          <div className="grid g2">
            <Field label="Category"><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{(list.data?.categories ?? []).map((c: string) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Amount (₹)"><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Paid to"><input value={f.paid_to} onChange={(e) => setF({ ...f, paid_to: e.target.value })} /></Field>
            <Field label="Mode"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option></select></Field>
            <Field label="Date"><input type="date" value={f.exp_date} onChange={(e) => setF({ ...f, exp_date: e.target.value })} /></Field>
            <Field label="Bill photo"><input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setF({ ...f, bills: e.target.files })} /></Field>
          </div>
          <Field label="Note"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <button className="btn" disabled={!(Number(f.amount) > 0) || a.busy} onClick={save}>Save</button>
        </Drawer>
      )}
    </>
  );
}

const CATS = ['Product defect', 'Short / wrong supply', 'Late delivery', 'Damaged in delivery', 'Billing / rate', 'Installation / service', 'Staff behaviour', 'Shop maintenance', 'Other'];
const KB_CATS = ['Site work', 'Delivery', 'Products', 'Customers', 'Accounts', 'Stores', 'Sales', 'Safety', 'Other'];

/** What goes wrong, how often, and how fast it gets fixed. */
function ComplaintAnalysis() {
  const [months, setMonths] = useState(6);
  const { data: d } = useApi<any>('/erp/complaints/analysis', { months });
  if (!d) return <div className="muted">Loading…</div>;
  const Bars = ({ rows, title }: { rows: any[]; title: string }) => {
    const max = Math.max(1, ...rows.map((r) => +r.n));
    return (
      <div className="card">
        <h3>{title}</h3>
        {rows.length ? rows.map((r) => (
          <div key={r.label} className="hbar" title={`${r.n} complaints · ${r.open_n ?? 0} open · avg ${r.avg_hours ?? '—'} h to fix`}>
            <span>{r.label}</span><div><i style={{ width: `${(+r.n / max) * 100}%` }} /></div><b>{r.n}</b>
          </div>
        )) : <div className="muted">No data</div>}
      </div>
    );
  };
  const k = d.kpis;
  const top = d.by_category[0];
  return (
    <div className="stack">
      <div className="row">
        <span className="muted">Period</span>
        <select className="input" style={{ width: 140 }} value={months} onChange={(e) => setMonths(+e.target.value)}>{[1, 3, 6, 12].map((m) => <option key={m} value={m}>Last {m} month{m > 1 ? 's' : ''}</option>)}</select>
      </div>
      <div className="grid g6">
        <Kpi label="Complaints" value={k.total} sub={`${k.open_now} open now`} />
        <Kpi label="Avg time to fix" value={k.avg_hours === null ? '—' : k.avg_hours >= 48 ? `${Math.round(k.avg_hours / 24)} days` : `${k.avg_hours} h`} />
        <Kpi label="Fixed within 48 h" value={k.within_48h_pct === null ? '—' : `${k.within_48h_pct}%`} tone={k.within_48h_pct !== null && k.within_48h_pct < 70 ? 'red' : 'green'} />
        <Kpi label="Closed" value={k.closed} />
        <Kpi label="Closed without a lesson" value={k.without_lesson} sub="add one to stop repeats" tone={k.without_lesson ? 'red' : undefined} />
        <Kpi label="Open > 7 days" value={d.aging.older ?? 0} tone={d.aging.older ? 'red' : undefined} />
      </div>
      {top && <div className="goal-help"><b>Biggest problem:</b> {top.label} — {top.n} of {k.total} complaints ({Math.round((top.n * 100) / Math.max(1, k.total))}%){top.avg_hours ? `, takes ~${top.avg_hours} h to fix` : ''}. Fix the cause of this one first.</div>}
      <div className="grid g2">
        <Bars title="By type of problem" rows={d.by_category} />
        <Bars title="By product" rows={d.by_product} />
        <Bars title="By person handling" rows={d.by_person} />
        <Bars title="Per month" rows={d.by_month.map((m: any) => ({ label: m.ym, n: m.n }))} />
      </div>
      <div className="grid g2">
        <div className="card"><h3>Open tickets by age</h3>
          {[['Under 1 day', d.aging.d1], ['1–3 days', d.aging.d3], ['3–7 days', d.aging.d7], ['Over 7 days', d.aging.older]].map(([l, v]) => <div key={l} className="list-item between"><span>{l}</span><b>{v ?? 0}</b></div>)}
        </div>
        <div className="card"><h3>Customers who complained again</h3>
          {d.repeat_customers.length ? d.repeat_customers.map((c: any) => <div key={c.label} className="list-item between"><span>{c.label}</span><b>{c.n}×</b></div>) : <div className="muted">None — good</div>}
        </div>
      </div>
    </div>
  );
}

// ───────── Complaints & maintenance ─────────
export function Complaints() {
  const { meta } = useMeta();
  const [tab, setTab] = useState('open');
  const list = useApi<any[]>('/erp/complaints', { status: tab === 'all' ? '' : tab === 'maintenance' ? 'open' : tab, type: tab === 'maintenance' ? 'maintenance' : '' });
  const customers = useList('customers');
  const products = useProducts();
  const [f, setF] = useState<any>(null);
  const [edit, setEdit] = useState<any>(null);
  const [lesson, setLesson] = useState<any>(null);
  const a = useAction();
  if (meta && !can(meta, 'complaints')) return <NoAccess />;
  const prodOpts = products.map((p) => ({ id: p.id, name: p.name }));
  const w = can(meta, 'complaints', true);
  return (
    <>
      <Topbar title="Complaints & maintenance" action={w ? <button className="btn" onClick={() => setF({ type: 'customer', title: '', description: '', priority: 'medium', customer_id: '', assigned_to: '' })}><Icon name="plus" /> New ticket</button> : undefined} />
      <ErrorBox msg={a.err} />
      <Tabs value={tab} onChange={setTab} tabs={[['open', 'Open'], ['maintenance', 'Shop maintenance'], ['resolved', 'Resolved'], ['all', 'All'], ['analysis', '📊 Analysis']]} />
      {tab === 'analysis' ? <ComplaintAnalysis /> : <DataTable rows={list.data} onRow={w ? (r) => setEdit({ ...r }) : undefined} cols={[
        ['Ticket', (r) => r.ticket_no], ['Type', (r) => (r.type === 'maintenance' ? 'Maintenance' : 'Customer')], ['Issue', (r) => <>{r.title}<div className="muted">{[r.category, r.product_name, r.customer_name, r.invoice_no].filter(Boolean).join(' · ')}{+r.lessons ? ' · 📘 lesson saved' : ''}</div></>],
        ['Priority', (r) => <St s={r.priority === 'high' ? 'rejected' : r.priority} />], ['Assigned', (r) => r.assigned_name ?? '—'], ['Opened', (r) => d8(r.created_at)], ['Status', (r) => <St s={r.status} />],
      ]} />}
      {f && (
        <Drawer title="New ticket" onClose={() => setF(null)} modal>
          <div className="grid g2">
            <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option value="customer">Customer complaint</option><option value="maintenance">Shop maintenance (AC, lift, electrical…)</option></select></Field>
            <Field label="Priority"><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>
            {f.type === 'customer' && <Field label="Customer"><Select value={f.customer_id} onChange={(v) => setF({ ...f, customer_id: v })} options={customers.data ?? []} /></Field>}
            <Field label="Assign to"><Select value={f.assigned_to} onChange={(v) => setF({ ...f, assigned_to: v })} options={meta?.users ?? []} /></Field>
            <Field label="What kind of problem"><select value={f.category ?? ''} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Choose…</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            {f.type === 'customer' && <Field label="Product (optional)"><Select value={f.product_id ?? ''} onChange={(v) => setF({ ...f, product_id: v })} options={prodOpts} /></Field>}
          </div>
          <Field label="Issue"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Details"><textarea className="input" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} style={{ width: '100%' }} /></Field>
          <button className="btn" disabled={!f.title || a.busy} onClick={() => a.run(async () => { await api('/erp/complaints', { body: f }); setF(null); list.reload(); })}>Create</button>
        </Drawer>
      )}
      {edit && (
        <Drawer title={`${edit.ticket_no} · ${edit.title}`} onClose={() => setEdit(null)} modal>
          <p className="muted">{edit.description}</p>
          <div className="grid g2">
            <Field label="Status"><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option></select></Field>
            <Field label="Assigned to"><Select value={edit.assigned_to} onChange={(v) => setEdit({ ...edit, assigned_to: v })} options={meta?.users ?? []} /></Field>
            <Field label="What kind of problem"><select value={edit.category ?? ''} onChange={(e) => setEdit({ ...edit, category: e.target.value })}><option value="">—</option>{CATS.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Product"><Select value={edit.product_id ?? ''} onChange={(v) => setEdit({ ...edit, product_id: v })} options={prodOpts} /></Field>
          </div>
          <Field label="Why did it happen (root cause)"><textarea className="input" rows={2} value={edit.root_cause ?? ''} onChange={(e) => setEdit({ ...edit, root_cause: e.target.value })} style={{ width: '100%' }} placeholder="Coils not counted at loading" /></Field>
          <Field label="What was done"><textarea className="input" rows={3} value={edit.resolution ?? ''} onChange={(e) => setEdit({ ...edit, resolution: e.target.value })} style={{ width: '100%' }} /></Field>
          <div className="row">
            <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api(`/erp/complaints/${edit.id}`, { method: 'PATCH', body: { status: edit.status, assigned_to: edit.assigned_to || null, resolution: edit.resolution, category: edit.category, product_id: edit.product_id || null, root_cause: edit.root_cause } }); setEdit(null); list.reload(); })}>Save</button>
            <button className="btn ghost" onClick={() => setLesson({ title: '', problem: [edit.title, edit.root_cause].filter(Boolean).join(' — '), lesson: '', category: edit.type === 'maintenance' ? 'Other' : 'Customers', source_type: 'complaint', source_id: edit.id })}>📘 Save a lesson to knowledge base</button>
          </div>
        </Drawer>
      )}
      {lesson && <KbForm k={lesson} categories={KB_CATS} onClose={() => setLesson(null)} onSaved={() => { setLesson(null); list.reload(); }} />}
    </>
  );
}
