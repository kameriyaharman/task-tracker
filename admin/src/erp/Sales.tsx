import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon, Loading } from '../ui';
import {
  ApprovalTrail, DataTable, History, ItemsEditor, NoAccess, ReasonModal, Select, St, Tabs, can, d8, linesBody, qty, rs, useAction, useList, useMeta, useProducts, type Line,
} from './common';
import { PaymentForm } from './Accounts';

export function SalesList() {
  const { meta } = useMeta();
  const [tab, setTab] = useState('invoice');
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState<string | null>(null);
  const list = useApi<any[]>('/erp/sales', { type: tab === 'quotation' ? 'quotation' : 'invoice', unpaid: tab === 'unpaid' ? 1 : '', status: tab === 'pending' ? 'pending_approval' : '', q });
  const nav = useNavigate();
  if (meta && !can(meta, 'sales')) return <NoAccess />;
  const w = can(meta, 'sales', true);
  return (
    <>
      <Topbar title="Sales" search={q} onSearch={setQ} action={w ? <div className="row">
        <button className="btn ghost" onClick={() => setCreating('quotation')}>New quotation</button>
        <button className="btn" onClick={() => setCreating('invoice')}><Icon name="plus" /> New bill</button>
      </div> : undefined} />
      <Tabs value={tab} onChange={setTab} tabs={[['invoice', 'Bills'], ['pending', 'Waiting approval'], ['unpaid', 'Unpaid / udhari'], ['quotation', 'Quotations']]} />
      <DataTable rows={list.data} onRow={(r) => nav(`/erp/sales/${r.id}`)} cols={[
        ['No.', (r) => <b style={{ fontWeight: 500 }}>{r.doc_no}</b>], ['Date', (r) => d8(r.doc_date)],
        ['Customer', (r) => <>{r.party_name}<div className="muted">{r.party_mobile ?? r.customer_mobile ?? ''}</div></>], ['Price', (r) => r.price_type],
        ['Payment', (r) => <St s={r.payment_mode} />], ['Total', (r) => rs(r.total), 'r'],
        ['Balance', (r) => (r.status === 'final' && r.doc_type === 'invoice' ? <b style={{ color: Number(r.total) - Number(r.paid_amount) > 0.5 ? 'var(--red)' : undefined }}>{rs(Number(r.total) - Number(r.paid_amount))}</b> : '—'), 'r'],
        ['Delivery', (r) => (r.delivery_status ? <St s={r.delivery_status} /> : '—')], ['Status', (r) => <St s={r.status} />],
      ]} />
      {creating && <SalesForm docType={creating} onClose={() => setCreating(null)} onSaved={(id) => nav(`/erp/sales/${id}`)} />}
    </>
  );
}

function SalesForm({ docType, doc, onClose, onSaved }: { docType: string; doc?: any; onClose: () => void; onSaved: (id: number) => void }) {
  const { meta } = useMeta();
  const customers = useList('customers');
  const products = useProducts();
  const [f, setF] = useState<any>({
    customer_id: doc?.customer_id ?? '', customer_name: doc?.customer_name ?? '', customer_mobile: doc?.customer_mobile ?? '', price_type: doc?.price_type ?? 'retail',
    payment_mode: doc?.payment_mode ?? 'cash', warehouse_id: doc?.warehouse_id ?? meta?.warehouses.find((w) => w.type === 'showroom')?.id ?? '',
    needs_delivery: doc ? !!+doc.needs_delivery : false, delivery_address: doc?.delivery_address ?? '', notes: doc?.notes ?? '',
  });
  const [lines, setLines] = useState<Line[]>(doc?.items?.map((i: any) => ({ product_id: i.product_id, name: i.product_name, unit: i.unit, qty: Number(i.qty), rate: Number(i.rate), gst_rate: Number(i.gst_rate), discount_pct: Number(i.discount_pct) })) ?? []);
  const cust = (customers.data ?? []).find((c) => String(c.id) === String(f.customer_id));
  const a = useAction();
  const priceKey = `${f.price_type}_price`;
  // switching customer type → reprice lines that still have the default price
  useEffect(() => { if (cust) setF((s: any) => ({ ...s, price_type: cust.type })); }, [cust?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLines((ls) => ls.map((l) => { const p = products.find((x) => x.id === l.product_id); return p ? { ...l, rate: Number(p[priceKey] ?? l.rate) } : l; }));
  }, [priceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockOf = (pid: number) => Number(products.find((p) => p.id === pid)?.stock ?? 0);
  const save = (submit: boolean) => a.run(async () => {
    const r = doc
      ? await api(`/erp/sales/${doc.id}`, { method: 'PATCH', body: { ...f, doc_type: docType, items: linesBody(lines), submit } })
      : await api('/erp/sales', { body: { ...f, doc_type: docType, items: linesBody(lines), submit } });
    onSaved(r.id); onClose();
  });
  return (
    <Drawer title={doc ? `Edit ${doc.doc_no}` : docType === 'quotation' ? 'New quotation' : 'New bill'} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="grid g2">
        <Field label="Customer"><Select value={f.customer_id} onChange={(v) => setF({ ...f, customer_id: v })} options={(customers.data ?? []).map((c) => ({ id: c.id, name: `${c.name}${c.mobile ? ' · ' + c.mobile : ''}` }))} placeholder="Walk-in customer" /></Field>
        {!f.customer_id ? (
          <div className="grid g2" style={{ gap: 8 }}>
            <Field label="Name"><input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></Field>
            <Field label="Mobile"><input value={f.customer_mobile} onChange={(e) => setF({ ...f, customer_mobile: e.target.value })} /></Field>
          </div>
        ) : (
          <div className="card" style={{ padding: 10, fontSize: 12.5 }}>
            Due now <b style={{ color: Number(cust?.outstanding) > 0 ? 'var(--red)' : undefined }}>{rs(cust?.outstanding)}</b> · limit {rs(cust?.credit_limit)} · {cust?.credit_days} days
          </div>
        )}
        <Field label="Price list"><select value={f.price_type} onChange={(e) => setF({ ...f, price_type: e.target.value })}><option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="contractor">Contractor</option></select></Field>
        <Field label="From"><Select value={f.warehouse_id} onChange={(v) => setF({ ...f, warehouse_id: v })} options={meta?.warehouses ?? []} /></Field>
        {docType === 'invoice' && <Field label="Payment"><select value={f.payment_mode} onChange={(e) => setF({ ...f, payment_mode: e.target.value })}>
          <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="credit">Udhari (credit)</option></select></Field>}
        <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <ItemsEditor lines={lines.map((l) => ({ ...l, stock: stockOf(l.product_id) }))} setLines={setLines} products={products} withDiscount priceKey={priceKey} showStock={docType === 'invoice'} />
      <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={f.needs_delivery} onChange={(e) => setF({ ...f, needs_delivery: e.target.checked })} /> Home / site delivery</label>
      {f.needs_delivery && <Field label="Delivery address"><input value={f.delivery_address} onChange={(e) => setF({ ...f, delivery_address: e.target.value })} placeholder={cust?.address ?? ''} /></Field>}
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" disabled={!lines.length || a.busy || (f.payment_mode === 'credit' && !f.customer_id)} onClick={() => save(true)}>{docType === 'quotation' ? 'Save quotation' : 'Save bill'}</button>
        <button className="btn ghost" disabled={!lines.length || a.busy} onClick={() => save(false)}>Save draft</button>
      </div>
      {f.payment_mode === 'credit' && !f.customer_id && <p className="muted">Udhari needs a saved customer.</p>}
      <p className="muted">Discount above the allowed limit or udhari above the credit limit goes for approval automatically.</p>
    </Drawer>
  );
}

export function SalesDetail() {
  const { id } = useParams();
  const { meta } = useMeta();
  const { data: s, error, reload } = useApi<any>(`/erp/sales/${id}`);
  const [edit, setEdit] = useState(false);
  const [cancel, setCancel] = useState(false);
  const [pay, setPay] = useState(false);
  const [ret, setRet] = useState(false);
  const a = useAction();
  const nav = useNavigate();
  if (!s) return <><Topbar title="Bill" /><ErrorBox msg={error} /><Loading /></>;
  const w = can(meta, 'sales', true);
  const balance = Number(s.total) - Number(s.paid_amount);
  const company = s.company?.name ?? 'Keshav Home Solution';
  return (
    <>
      <Topbar title={`${s.doc_type === 'quotation' ? 'Quotation' : 'Bill'} ${s.doc_no}`} action={
        <div className="row">
          {w && ['draft', 'rejected'].includes(s.status) && <button className="btn ghost" onClick={() => setEdit(true)}>Edit</button>}
          {w && ['draft', 'rejected'].includes(s.status) && <button className="btn" onClick={() => a.run(async () => { await api(`/erp/sales/${id}/submit`, { body: {} }); reload(); })}>Finalise</button>}
          {w && s.doc_type === 'quotation' && s.status === 'final' && <button className="btn" onClick={() => a.run(async () => { const r = await api(`/erp/sales/${id}/convert`, { body: {} }); nav(`/erp/sales/${r.id}`); })}>Convert to bill</button>}
          {s.doc_type === 'invoice' && s.status === 'final' && balance > 0.5 && s.customer_id && (can(meta, 'accounts', true) || can(meta, 'recovery', true)) && <button className="btn ok" onClick={() => setPay(true)}>Receive payment</button>}
          {s.doc_type === 'invoice' && s.status === 'final' && !s.deliveries.length && can(meta, 'delivery', true) && <button className="btn ghost" onClick={() => a.run(async () => { await api('/erp/deliveries', { body: { invoice_id: s.id } }); reload(); })}><Icon name="truck" /> Create delivery</button>}
          {s.doc_type === 'invoice' && s.status === 'final' && can(meta, 'returns', true) && <button className="btn ghost" onClick={() => setRet(true)}><Icon name="undo" /> Return</button>}
          {w && !['final', 'cancelled', 'converted'].includes(s.status) && <button className="btn danger" onClick={() => setCancel(true)}>Cancel</button>}
          <button className="btn ghost" onClick={() => window.print()}><Icon name="print" /> Print</button>
        </div>
      } />
      <ErrorBox msg={a.err} />
      <div className="card doc print-area">
        <div className="between print-head">
          <div><h2 style={{ margin: 0 }}>{company}</h2><div className="muted">Construction Solution · Hardware · Paint · Electrical</div></div>
          <div style={{ textAlign: 'right' }}><b>{s.doc_type === 'quotation' ? 'QUOTATION' : 'TAX INVOICE'}</b><div>{s.doc_no}</div><div className="muted">{d8(s.doc_date)}</div></div>
        </div>
        <div className="between" style={{ margin: '14px 0' }}>
          <div><small className="muted">Bill to</small><div><b>{s.party_name}</b></div><div className="muted">{[s.party_mobile ?? s.customer_mobile, s.party_gstin, s.party_address].filter(Boolean).join(' · ')}</div></div>
          <div style={{ textAlign: 'right' }} className="no-print"><St s={s.status} /> <St s={s.payment_mode} /><div className="muted">{s.price_type} price · {s.warehouse_name} · by {s.created_by_name}</div></div>
        </div>
        <table className="t">
          <thead><tr><th>#</th><th>Item</th><th>HSN</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Disc</th><th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
          <tbody>{s.items.map((i: any, n: number) => (
            <tr key={i.id}><td>{n + 1}</td><td>{i.product_name}{Number(i.returned_qty) > 0 && <span className="muted"> (returned {qty(i.returned_qty)})</span>}</td><td>{i.hsn ?? ''}</td>
              <td style={{ textAlign: 'right' }}>{qty(i.qty)} {i.unit}</td><td style={{ textAlign: 'right' }}>{rs(i.rate, 2)}</td>
              <td style={{ textAlign: 'right' }}>{Number(i.discount_pct) ? `${qty(i.discount_pct)}%` : ''}</td><td style={{ textAlign: 'right' }}>{qty(i.gst_rate)}%</td>
              <td style={{ textAlign: 'right' }}>{rs(i.amount, 2)}</td></tr>
          ))}</tbody>
        </table>
        <div className="totals">
          <span>Subtotal {rs(s.subtotal, 2)}</span>{Number(s.discount) > 0 && <span>Discount −{rs(s.discount, 2)}</span>}
          <span>CGST {rs(Number(s.tax) / 2, 2)}</span><span>SGST {rs(Number(s.tax) / 2, 2)}</span><b>Total {rs(s.total)}</b>
        </div>
        {s.doc_type === 'invoice' && s.status === 'final' && <div className="totals"><span>Paid / adjusted {rs(s.paid_amount)}</span><b style={{ color: balance > 0.5 ? 'var(--red)' : 'var(--green)' }}>Balance {rs(balance)}</b>{s.due_date && balance > 0.5 && <span>Due {d8(s.due_date)}</span>}</div>}
        {s.notes && <p className="muted">{s.notes}</p>}
      </div>
      {s.deliveries.length > 0 && (
        <div className="card no-print" style={{ marginTop: 12 }}>
          <h3>Delivery</h3>
          {s.deliveries.map((d: any) => <div key={d.id} className="list-item between click" onClick={() => nav(`/erp/deliveries?open=${d.id}`)}><span>{d.delivery_no} · {d.assigned_name ?? 'not assigned'} · {d.address ?? ''}</span><St s={d.status} /></div>)}
        </div>
      )}
      {s.returns.length > 0 && <div className="card no-print" style={{ marginTop: 12 }}><h3>Returns</h3>{s.returns.map((r: any) => <div key={r.id} className="list-item between"><span>{r.return_no} · {d8(r.created_at)}</span><span>{rs(r.total)} <St s={r.status} /></span></div>)}</div>}
      <div className="no-print"><ApprovalTrail rows={s.approvals} /><History rows={s.history} /></div>
      {edit && <SalesForm docType={s.doc_type} doc={s} onClose={() => setEdit(false)} onSaved={() => reload()} />}
      {cancel && <ReasonModal title="Cancel this document?" onClose={() => setCancel(false)} onOk={async (reason) => { await api(`/erp/sales/${id}/cancel`, { body: { reason } }); reload(); }} />}
      {pay && <PaymentForm direction="in" partyId={s.customer_id} amount={balance} onClose={() => setPay(false)} onSaved={() => { setPay(false); reload(); }} />}
      {ret && <SalesReturnForm inv={s} onClose={() => setRet(false)} onSaved={() => { setRet(false); reload(); }} />}
    </>
  );
}

export function SalesReturnForm({ inv, onClose, onSaved }: { inv: any; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<any[]>(inv.items.map((i: any) => ({ ref_item_id: i.id, name: i.product_name, unit: i.unit, max: Number(i.qty) - Number(i.returned_qty), qty: 0, restock: true })));
  const [reason, setReason] = useState('');
  const a = useAction();
  return (
    <Drawer title={`Sales return · ${inv.doc_no}`} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <table className="t items">
        <thead><tr><th>Item</th><th>Can return</th><th>Return qty</th><th>Back to stock?</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td>{r.name}</td><td>{qty(r.max)} {r.unit}</td>
            <td><input type="number" min="0" max={r.max} step="any" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} style={{ width: 80 }} /></td>
            <td><input type="checkbox" checked={r.restock} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, restock: e.target.checked } : x)))} /> {r.restock ? 'Good, restock' : 'Damaged'}</td></tr>
        ))}</tbody>
      </table>
      <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      <button className="btn" disabled={a.busy || !rows.some((r) => Number(r.qty) > 0) || !reason} onClick={() => a.run(async () => {
        await api('/erp/returns', { body: { type: 'sales', ref_id: inv.id, reason, items: rows.filter((r) => Number(r.qty) > 0).map((r) => ({ ref_item_id: r.ref_item_id, qty: Number(r.qty), restock: r.restock })) } });
        onSaved();
      })}>Save return</button>
      <p className="muted">After approval: stock comes back (if restocked) and the customer's balance is reduced.</p>
    </Drawer>
  );
}
