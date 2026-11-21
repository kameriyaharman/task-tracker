import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon, Loading } from '../ui';
import {
  ApprovalTrail, DataTable, Files, History, ItemsEditor, NoAccess, ReasonModal, Select, St, Tabs, can, d8, linesBody, qty, rs, useAction, useList, useMeta, useProducts, type Line,
} from './common';

export function PurchaseList() {
  const { meta } = useMeta();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useApi<any[]>('/erp/purchase-orders', { status, q });
  const nav = useNavigate();
  if (meta && !can(meta, 'purchase')) return <NoAccess />;
  return (
    <>
      <Topbar title="Purchase orders" search={q} onSearch={setQ}
        action={can(meta, 'purchase', true) ? <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> New PO</button> : undefined} />
      <Tabs value={status} onChange={setStatus} tabs={[['', 'All'], ['draft', 'Draft'], ['pending_approval', 'Waiting approval'], ['approved', 'Approved'], ['ordered', 'Ordered'], ['partial', 'Partly received'], ['received', 'Received']]} />
      <DataTable rows={list.data} onRow={(r) => nav(`/erp/purchase/${r.id}`)} cols={[
        ['PO', (r) => <b style={{ fontWeight: 500 }}>{r.po_no}</b>], ['Date', (r) => d8(r.order_date)], ['Vendor', (r) => r.vendor_name],
        ['Godown', (r) => r.warehouse_name], ['Received', (r) => `${qty(r.received)} / ${qty(r.qty)}`], ['Total', (r) => rs(r.total), 'r'],
        ['Status', (r) => <St s={r.status} />], ['By', (r) => r.created_by_name],
      ]} />
      {creating && <PoForm onClose={() => setCreating(false)} onSaved={(id) => nav(`/erp/purchase/${id}`)} />}
    </>
  );
}

function PoForm({ po, onClose, onSaved }: { po?: any; onClose: () => void; onSaved: (id: number) => void }) {
  const { meta } = useMeta();
  const vendors = useList('vendors');
  const products = useProducts();
  const [f, setF] = useState<any>({ vendor_id: po?.vendor_id ?? '', warehouse_id: po?.warehouse_id ?? '', expected_date: po?.expected_date ?? '', notes: po?.notes ?? '' });
  const [lines, setLines] = useState<Line[]>(po?.items?.map((i: any) => ({ product_id: i.product_id, name: i.product_name, unit: i.unit, qty: Number(i.qty), rate: Number(i.rate), gst_rate: Number(i.gst_rate) })) ?? []);
  const a = useAction();
  const save = (submit: boolean) => a.run(async () => {
    const body = { ...f, items: linesBody(lines), submit };
    const r = po ? await api(`/erp/purchase-orders/${po.id}`, { method: 'PATCH', body }) : await api('/erp/purchase-orders', { body });
    onSaved(r.id); onClose();
  });
  return (
    <Drawer title={po ? `Edit ${po.po_no}` : 'New purchase order'} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="grid g2">
        <Field label="Vendor"><Select value={f.vendor_id} onChange={(v) => setF({ ...f, vendor_id: v })} options={vendors.data ?? []} placeholder="Choose vendor" /></Field>
        <Field label="Deliver to"><Select value={f.warehouse_id} onChange={(v) => setF({ ...f, warehouse_id: v })} options={meta?.warehouses ?? []} placeholder="Default" /></Field>
        <Field label="Expected by"><input type="date" value={f.expected_date} onChange={(e) => setF({ ...f, expected_date: e.target.value })} /></Field>
        <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <ItemsEditor lines={lines} setLines={setLines} products={products} priceKey="purchase_price" />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!f.vendor_id || !lines.length || a.busy} onClick={() => save(true)}>Save &amp; send for approval</button>
        <button className="btn ghost" disabled={!f.vendor_id || !lines.length || a.busy} onClick={() => save(false)}>Save draft</button>
      </div>
    </Drawer>
  );
}

export function PurchaseDetail() {
  const { id } = useParams();
  const { meta } = useMeta();
  const { data: po, error, reload } = useApi<any>(`/erp/purchase-orders/${id}`);
  const [edit, setEdit] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [cancel, setCancel] = useState(false);
  const a = useAction();
  const nav = useNavigate();
  const w = can(meta, 'purchase', true);
  const act = (path: string, body: any = {}) => a.run(async () => { await api(`/erp/purchase-orders/${id}/${path}`, { body }); reload(); });
  if (!po) return <><Topbar title="Purchase order" /><ErrorBox msg={error} /><Loading /></>;
  return (
    <>
      <Topbar title={`PO ${po.po_no}`} action={
        <div className="row">
          {w && ['draft', 'rejected'].includes(po.status) && <button className="btn ghost" onClick={() => setEdit(true)}>Edit</button>}
          {w && ['draft', 'rejected'].includes(po.status) && <button className="btn" onClick={() => act('submit')}>Send for approval</button>}
          {w && po.status === 'approved' && <button className="btn ghost" onClick={() => act('status', { status: 'ordered' })}>Mark ordered</button>}
          {can(meta, 'inventory', true) && ['approved', 'ordered', 'partial'].includes(po.status) && <button className="btn" onClick={() => setReceiving(true)}><Icon name="box" /> Receive goods (GRN)</button>}
          {w && ['partial', 'ordered'].includes(po.status) && <button className="btn ghost" onClick={() => act('status', { status: 'closed' })}>Close PO</button>}
          {w && ['draft', 'pending_approval', 'approved', 'ordered', 'rejected'].includes(po.status) && <button className="btn danger" onClick={() => setCancel(true)}>Cancel</button>}
          <button className="btn ghost" onClick={() => window.print()}><Icon name="print" /></button>
        </div>
      } />
      <ErrorBox msg={a.err} />
      <div className="card doc">
        <div className="between"><div><h2 style={{ margin: 0 }}>{po.vendor_name}</h2><div className="muted">{[po.vendor_mobile, po.vendor_gstin].filter(Boolean).join(' · ')}</div></div><St s={po.status} /></div>
        <div className="grid g4" style={{ margin: '14px 0' }}>
          <div><small className="muted">Date</small><div>{d8(po.order_date)}</div></div>
          <div><small className="muted">Expected</small><div>{d8(po.expected_date)}</div></div>
          <div><small className="muted">Deliver to</small><div>{po.warehouse_name}</div></div>
          <div><small className="muted">Made by</small><div>{po.created_by_name}</div></div>
        </div>
        <table className="t">
          <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Ordered</th><th style={{ textAlign: 'right' }}>Received</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>{po.items.map((i: any) => (
            <tr key={i.id}><td>{i.product_name}</td><td style={{ textAlign: 'right' }}>{qty(i.qty)} {i.unit}</td><td style={{ textAlign: 'right' }}>{qty(i.received_qty)}</td>
              <td style={{ textAlign: 'right' }}>{rs(i.rate, 2)}</td><td style={{ textAlign: 'right' }}>{qty(i.gst_rate)}%</td><td style={{ textAlign: 'right' }}>{rs(i.amount, 2)}</td></tr>
          ))}</tbody>
        </table>
        <div className="totals"><span>Subtotal {rs(po.subtotal, 2)}</span><span>GST {rs(po.tax, 2)}</span><b>Total {rs(po.total)}</b></div>
        {po.notes && <p className="muted">{po.notes}</p>}
        <Files files={po.files} />
      </div>
      {po.grns.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Goods received</h3>
          {po.grns.map((g: any) => <div key={g.id} className="list-item between click" onClick={() => nav(`/erp/grn/${g.id}`)}><span>{g.grn_no} · {d8(g.created_at)}</span><span>{rs(g.total)} <St s={g.status} /></span></div>)}
        </div>
      )}
      <ApprovalTrail rows={po.approvals} />
      <History rows={po.history} />
      {edit && <PoForm po={po} onClose={() => setEdit(false)} onSaved={() => reload()} />}
      {receiving && <GrnForm po={po} onClose={() => setReceiving(false)} onSaved={(gid) => nav(`/erp/grn/${gid}`)} />}
      {cancel && <ReasonModal title="Cancel this PO?" onClose={() => setCancel(false)} onOk={async (reason) => { await api(`/erp/purchase-orders/${id}/status`, { body: { status: 'cancelled', reason } }); reload(); }} />}
    </>
  );
}

/** Goods receipt: from a PO (shows pending qty) or direct from a vendor. */
export function GrnForm({ po, onClose, onSaved }: { po?: any; onClose: () => void; onSaved: (id: number) => void }) {
  const { meta } = useMeta();
  const vendors = useList('vendors');
  const products = useProducts();
  const [f, setF] = useState<any>({ vendor_id: po?.vendor_id ?? '', warehouse_id: po?.warehouse_id ?? '', bill_no: '', bill_date: new Date().toISOString().slice(0, 10), bill_amount: '', notes: '' });
  const [lines, setLines] = useState<Line[]>(po ? po.items.filter((i: any) => Number(i.qty) > Number(i.received_qty)).map((i: any) => ({
    product_id: i.product_id, name: i.product_name, unit: i.unit, po_item_id: i.id, ordered: Number(i.qty) - Number(i.received_qty),
    qty: Number(i.qty) - Number(i.received_qty), damaged_qty: 0, rate: Number(i.rate), gst_rate: Number(i.gst_rate),
  })) : []);
  const [photos, setPhotos] = useState<FileList | null>(null);
  const a = useAction();
  const upd = (i: number, k: string, v: any) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = () => a.run(async () => {
    const fd = new FormData();
    const body: any = { ...f, po_id: po?.id ?? '', items: linesBody(lines) };
    fd.append('payload', JSON.stringify(body));
    Object.entries(body).forEach(([k, v]) => k !== 'items' && fd.append(k, String(v ?? '')));
    linesBody(lines).forEach((l, i) => Object.entries(l).forEach(([k, v]) => v !== undefined && v !== null && fd.append(`items[${i}][${k}]`, String(v))));
    Array.from(photos ?? []).forEach((p) => fd.append('photos[]', p));
    const r = await api('/erp/grns', { body: fd });
    onSaved(r.id); onClose();
  });
  const total = lines.reduce((s, l) => s + Number(l.qty || 0) * Number(l.rate || 0) * (1 + Number(l.gst_rate || 0) / 100), 0);
  return (
    <Drawer title={po ? `Receive goods · ${po.po_no}` : 'Receive goods (GRN)'} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="grid g2">
        {!po && <Field label="Vendor"><Select value={f.vendor_id} onChange={(v) => setF({ ...f, vendor_id: v })} options={vendors.data ?? []} placeholder="Choose vendor" /></Field>}
        <Field label="Godown"><Select value={f.warehouse_id} onChange={(v) => setF({ ...f, warehouse_id: v })} options={meta?.warehouses ?? []} placeholder="Default" /></Field>
        <Field label="Vendor bill no."><input value={f.bill_no} onChange={(e) => setF({ ...f, bill_no: e.target.value })} /></Field>
        <Field label="Bill date"><input type="date" value={f.bill_date} onChange={(e) => setF({ ...f, bill_date: e.target.value })} /></Field>
        <Field label="Bill amount (if different)"><input type="number" value={f.bill_amount} onChange={(e) => setF({ ...f, bill_amount: e.target.value })} placeholder={rs(total)} /></Field>
        <Field label="Photos of material / bill"><input type="file" multiple accept="image/*,application/pdf" onChange={(e) => setPhotos(e.target.files)} /></Field>
      </div>
      {po ? (
        <div className="card" style={{ padding: 6 }}>
          <table className="t items">
            <thead><tr><th>Item</th><th>Pending</th><th>Good qty received</th><th>Damaged</th><th>Rate</th></tr></thead>
            <tbody>{lines.map((l, i) => (
              <tr key={i}><td>{l.name}</td><td>{qty(l.ordered)} {l.unit}</td>
                <td><input type="number" min="0" step="any" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} style={{ width: 80 }} /></td>
                <td><input type="number" min="0" step="any" value={l.damaged_qty} onChange={(e) => upd(i, 'damaged_qty', e.target.value)} style={{ width: 70 }} /></td>
                <td><input type="number" min="0" step="any" value={l.rate} onChange={(e) => upd(i, 'rate', e.target.value)} style={{ width: 90 }} /></td></tr>
            ))}</tbody>
          </table>
          <div className="totals"><b>Bill value {rs(total)}</b></div>
        </div>
      ) : <ItemsEditor lines={lines} setLines={setLines} products={products} priceKey="purchase_price" />}
      <Field label="Notes (shortage, quality…)"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <p className="muted">Stock is added after the GRN is approved. Damaged quantity is recorded but not added to stock.</p>
      <button className="btn" disabled={a.busy || !lines.length || (!po && !f.vendor_id)} onClick={save}>Save GRN</button>
    </Drawer>
  );
}

export function GrnList() {
  const { meta } = useMeta();
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const list = useApi<any[]>('/erp/grns', { status, q });
  const nav = useNavigate();
  if (meta && !can(meta, 'inventory')) return <NoAccess />;
  return (
    <>
      <Topbar title="Goods received (GRN)" search={q} onSearch={setQ}
        action={can(meta, 'inventory', true) ? <button className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> Receive without PO</button> : undefined} />
      <Tabs value={status} onChange={setStatus} tabs={[['', 'All'], ['pending_approval', 'Waiting approval'], ['approved', 'Approved'], ['rejected', 'Rejected']]} />
      <DataTable rows={list.data} onRow={(r) => nav(`/erp/grn/${r.id}`)} cols={[
        ['GRN', (r) => <b style={{ fontWeight: 500 }}>{r.grn_no}</b>], ['Date', (r) => d8(r.created_at)], ['Vendor', (r) => r.vendor_name], ['PO', (r) => r.po_no ?? '—'],
        ['Bill', (r) => r.bill_no ?? '—'], ['Godown', (r) => r.warehouse_name], ['Amount', (r) => rs(r.total), 'r'],
        ['Paid', (r) => (r.status === 'approved' ? rs(r.paid_amount) : '—'), 'r'], ['Status', (r) => <St s={r.status} />],
      ]} />
      {creating && <GrnForm onClose={() => setCreating(false)} onSaved={(id) => nav(`/erp/grn/${id}`)} />}
    </>
  );
}

export function GrnDetail() {
  const { id } = useParams();
  const { data: g, error } = useApi<any>(`/erp/grns/${id}`);
  const nav = useNavigate();
  if (!g) return <><Topbar title="GRN" /><ErrorBox msg={error} /><Loading /></>;
  return (
    <>
      <Topbar title={`GRN ${g.grn_no}`} action={<button className="btn ghost" onClick={() => window.print()}><Icon name="print" /></button>} />
      <div className="card doc">
        <div className="between"><div><h2 style={{ margin: 0 }}>{g.vendor_name}</h2><div className="muted">Bill {g.bill_no ?? '—'} · {d8(g.bill_date)}{g.po_no && <> · <a className="link" onClick={() => nav(`/erp/purchase/${g.po_id}`)}>{g.po_no}</a></>}</div></div><St s={g.status} /></div>
        <table className="t" style={{ marginTop: 12 }}>
          <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Accepted</th><th style={{ textAlign: 'right' }}>Damaged</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>{g.items.map((i: any) => (
            <tr key={i.id}><td>{i.product_name}</td><td style={{ textAlign: 'right' }}>{qty(i.qty)} {i.unit}</td><td style={{ textAlign: 'right', color: Number(i.damaged_qty) ? 'var(--red)' : undefined }}>{qty(i.damaged_qty)}</td>
              <td style={{ textAlign: 'right' }}>{rs(i.rate, 2)}</td><td style={{ textAlign: 'right' }}>{rs(i.amount, 2)}</td></tr>
          ))}</tbody>
        </table>
        <div className="totals"><span>Godown: {g.warehouse_name}</span><span>Received by {g.created_by_name}</span><b>Bill {rs(g.total)}</b>{g.status === 'approved' && <span>Paid {rs(g.paid_amount)}</span>}</div>
        {g.notes && <p className="muted">{g.notes}</p>}
        <Files files={g.files} />
      </div>
      <ApprovalTrail rows={g.approvals} />
      <History rows={g.history} />
    </>
  );
}
