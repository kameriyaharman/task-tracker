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
import { useRecorder, VoiceNote } from '../voice';

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
    customer_address: doc?.customer_address ?? '', billing_address: doc?.billing_address ?? '', save_customer: false, terms: doc?.terms ?? '',
  });
  const [charges, setCharges] = useState<{ label: string; amount: any }[]>(doc?.charges ?? []);
  const [code, setCode] = useState('');
  const profile = useApi<any>('/erp/business-profile');
  const chargesTotal = charges.reduce((t, c) => t + (Number(c.amount) || 0), 0);
  const [lines, setLines] = useState<Line[]>(doc?.items?.map((i: any) => ({ product_id: i.product_id, name: i.product_name, unit: i.unit, qty: Number(i.qty), rate: Number(i.rate), gst_rate: Number(i.gst_rate), discount_pct: Number(i.discount_pct) })) ?? []);
  const cust = (customers.data ?? []).find((c) => String(c.id) === String(f.customer_id));
  const itemsTotal = lines.reduce((t, l) => { const v = Number(l.qty) * Number(l.rate) * (1 - (Number(l.discount_pct) || 0) / 100); return t + v * (1 + Number(l.gst_rate) / 100); }, 0);
  const a = useAction();
  const priceKey = `${f.price_type}_price`;
  // switching customer type → reprice lines that still have the default price
  useEffect(() => { if (cust) setF((s: any) => ({ ...s, price_type: cust.price_type ?? 'retail', billing_address: s.billing_address || cust.billing_address || cust.address || '' })); }, [cust?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setLines((ls) => ls.map((l) => { const p = products.find((x) => x.id === l.product_id); return p ? { ...l, rate: Number(p[priceKey] ?? l.rate) } : l; }));
  }, [priceKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const stockOf = (pid: number) => Number(products.find((p) => p.id === pid)?.stock ?? 0);
  const save = (submit: boolean) => a.run(async () => {
    const body = { ...f, doc_type: docType, items: linesBody(lines), submit, charges: charges.filter((c) => c.label && Number(c.amount) > 0) };
    const r = doc ? await api<any>(`/erp/sales/${doc.id}`, { method: 'PATCH', body }) : await api<any>('/erp/sales', { body });
    if (r.notice) alert(r.notice);
    onSaved(r.id); onClose();
  });
  const pickCode = (v: string) => {
    setCode(v);
    const c = (customers.data ?? []).find((x) => String(x.code) === v.trim());
    if (c) setF((s: any) => ({ ...s, customer_id: c.id }));
  };
  const CHARGE_TYPES = ['Handling charges', 'Packing charges', 'Transport — rickshaw', 'Transport — tempo', 'Transport — truck', 'Porter / loading', 'Unloading', 'Other'];
  return (
    <Drawer title={doc ? `Edit ${doc.doc_no}` : docType === 'quotation' ? 'New quotation' : 'New bill'} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="grid g2">
        <Field label="Customer (type code or choose)">
          <div className="row" style={{ gap: 6 }}>
            <input className="input" style={{ width: 70 }} value={code} onChange={(e) => pickCode(e.target.value)} placeholder="Code" title="Customer code, e.g. 24" />
            <div style={{ flex: 1 }}><Select value={f.customer_id} onChange={(v) => setF({ ...f, customer_id: v })} options={(customers.data ?? []).map((c) => ({ id: c.id, name: `${c.code ? `#${c.code} ` : ''}${c.business_name || c.name}${c.mobile ? ' · ' + c.mobile : ''}` }))} placeholder="Walk-in customer" /></div>
          </div>
        </Field>
        {!f.customer_id ? (
          <div>
            <div className="grid g2" style={{ gap: 8 }}>
              <Field label="Name"><input value={f.customer_name} onChange={(e) => setF({ ...f, customer_name: e.target.value })} /></Field>
              <Field label="Mobile"><input value={f.customer_mobile} onChange={(e) => setF({ ...f, customer_mobile: e.target.value })} /></Field>
            </div>
            <Field label="Address (printed on bill)"><input value={f.customer_address} onChange={(e) => setF({ ...f, customer_address: e.target.value })} /></Field>
            <label className="check"><input type="checkbox" checked={f.save_customer} onChange={(e) => setF({ ...f, save_customer: e.target.checked })} /> Save as a customer (next time pick by name / code)</label>
          </div>
        ) : (
          <div className="card" style={{ padding: 10, fontSize: 12.5 }}>
            <b>{cust?.business_name || cust?.name}</b> {cust?.rating && cust.rating !== 'Regular' ? `· ${cust.rating}` : ''} · {cust?.type}<br />
            Due now <b style={{ color: Number(cust?.outstanding) > 0 ? 'var(--red)' : undefined }}>{rs(cust?.outstanding)}</b> · limit {rs(cust?.credit_limit)} · {cust?.credit_days} days
            <Field label="Billing address"><input value={f.billing_address} onChange={(e) => setF({ ...f, billing_address: e.target.value })} /></Field>
          </div>
        )}
        <Field label="Price list"><select value={f.price_type} onChange={(e) => setF({ ...f, price_type: e.target.value })}><option value="retail">Retail</option><option value="wholesale">Wholesale</option><option value="contractor">Contractor</option></select></Field>
        <Field label="From"><Select value={f.warehouse_id} onChange={(v) => setF({ ...f, warehouse_id: v })} options={meta?.warehouses ?? []} /></Field>
        {docType === 'invoice' && <Field label="Payment"><select value={f.payment_mode} onChange={(e) => setF({ ...f, payment_mode: e.target.value })}>
          <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option><option value="credit">Udhari (credit)</option></select></Field>}
        <Field label="Notes"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <ItemsEditor lines={lines.map((l) => ({ ...l, stock: stockOf(l.product_id) }))} setLines={setLines} products={products} withDiscount priceKey={priceKey} showStock={docType === 'invoice'} />
      <div className="card" style={{ padding: 10, marginTop: 10 }}>
        <div className="between"><b>Extra charges</b><span className="muted">printed on the bill</span></div>
        {charges.map((c, i) => (
          <div key={i} className="row" style={{ gap: 6, marginTop: 6 }}>
            <select className="input" style={{ flex: 2 }} value={CHARGE_TYPES.includes(c.label) ? c.label : 'Other'} onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, label: e.target.value === 'Other' ? '' : e.target.value } : x)))}>
              {CHARGE_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
            {!CHARGE_TYPES.slice(0, -1).includes(c.label) && <input className="input" style={{ flex: 2 }} value={c.label} placeholder="Charge name" onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />}
            <input className="input" type="number" style={{ width: 110 }} value={c.amount} placeholder="₹" onChange={(e) => setCharges(charges.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
            <button className="link" onClick={() => setCharges(charges.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        <button className="btn ghost sm" style={{ marginTop: 6 }} onClick={() => setCharges([...charges, { label: 'Handling charges', amount: '' }])}>＋ Handling / packing / transport</button>
        <div className="totals" style={{ marginTop: 6 }}><span>Items {rs(itemsTotal, 2)}</span>{chargesTotal > 0 && <span>Charges {rs(chargesTotal, 2)}</span>}<b>Total {rs(Math.round(itemsTotal + chargesTotal))}</b></div>
      </div>
      <details style={{ marginTop: 8 }}>
        <summary className="muted" style={{ cursor: 'pointer' }}>Terms & conditions on this {docType === 'quotation' ? 'quotation' : 'bill'}</summary>
        <textarea className="input" rows={4} style={{ width: '100%', marginTop: 6 }} value={f.terms || profile.data?.terms || ''} onChange={(e) => setF({ ...f, terms: e.target.value })} />
      </details>
      <label className="check" style={{ marginTop: 10 }}><input type="checkbox" checked={f.needs_delivery} onChange={(e) => setF({ ...f, needs_delivery: e.target.checked })} /> Home / site delivery</label>
      {f.needs_delivery && <Field label="Delivery address"><input value={f.delivery_address} onChange={(e) => setF({ ...f, delivery_address: e.target.value })} placeholder={cust?.address ?? ''} /></Field>}
      <div className="row" style={{ marginTop: 12, flexWrap: 'wrap' }}>
        <button className="btn ghost" disabled={!lines.length || a.busy} onClick={() => save(false)}>💾 Save as draft (can edit)</button>
        <button className="btn" disabled={!lines.length || a.busy || (f.payment_mode === 'credit' && !f.customer_id)} onClick={() => save(true)}>{docType === 'quotation' ? '✔ Finalise quotation' : '✔ Finalise bill'}</button>
      </div>
      <p className="muted">Draft = proforma: you can still change it and send it to the customer for approval. Final = locked; stock and accounts are updated.</p>
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
  const company = s.profile?.display_name || s.company?.name || 'Keshav Home Solution';
  const share = () => a.run(async () => { const r = await api<any>(`/erp/sales/${id}/share`, { body: { base: window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') } }); window.open(r.wa, '_blank'); reload(); });
  const isDraft = ['draft', 'rejected'].includes(s.status);
  const locked = !isDraft;
  return (
    <>
      <Topbar title={`${s.doc_type === 'quotation' ? 'Quotation' : 'Bill'} ${s.doc_no}`} action={
        <div className="row">
          {w && isDraft && <button className="btn ghost" onClick={() => setEdit(true)}>Edit</button>}
          {isDraft && (s.can_finalise || s.doc_type === 'quotation') && <button className="btn" onClick={() => a.run(async () => { await api(`/erp/sales/${id}/submit`, { body: {} }); reload(); window.scrollTo(0, 0); })}>✔ Finalise</button>}
          {s.status !== 'cancelled' && <button className="btn ghost wa" onClick={share}><Icon name="whatsapp" /> {s.doc_type === 'invoice' && s.status === 'final' ? 'Send bill on WhatsApp' : 'Send for customer approval'}</button>}
          {w && s.doc_type === 'quotation' && s.status === 'final' && <button className="btn" onClick={() => a.run(async () => { const r = await api(`/erp/sales/${id}/convert`, { body: {} }); nav(`/erp/sales/${r.id}`); })}>Convert to bill</button>}
          {s.doc_type === 'invoice' && s.status === 'final' && balance > 0.5 && s.customer_id && (can(meta, 'accounts', true) || can(meta, 'recovery', true)) && <button className="btn ok" onClick={() => setPay(true)}>Receive payment</button>}
          {s.doc_type === 'invoice' && s.status === 'final' && !s.deliveries.length && can(meta, 'delivery', true) && <button className="btn ghost" onClick={() => a.run(async () => { await api('/erp/deliveries', { body: { invoice_id: s.id } }); reload(); })}><Icon name="truck" /> Create delivery</button>}
          {s.doc_type === 'invoice' && s.status === 'final' && can(meta, 'returns', true) && <button className="btn ghost" onClick={() => setRet(true)}><Icon name="undo" /> Return</button>}
          {w && isDraft && <button className="btn danger" onClick={() => setCancel(true)}>Cancel</button>}
          <button className="btn ghost" onClick={() => window.print()}><Icon name="print" /> Print</button>
        </div>
      } />
      {a.err && <div className="big-error" role="alert">⚠ {a.err}</div>}
      {locked && s.status !== 'cancelled' && <div className="lock-note">🔒 {s.status === 'final' ? 'Final — locked. Changes need a sales return or a new bill.' : s.status === 'pending_approval' ? 'Waiting for approval — locked until approved or rejected.' : `This is ${s.status}.`}</div>}
      {isDraft && s.doc_type === 'invoice' && !s.can_finalise && <div className="lock-note">📝 Draft / proforma. The accountant or manager will finalise it.</div>}
      {s.customer_approval !== 'none' && (
        <div className={`lock-note ${s.customer_approval === 'approved' ? 'ok' : s.customer_approval === 'changes' ? 'warn' : ''}`}>
          {s.customer_approval === 'sent' && '📤 Sent to customer — waiting for their approval on WhatsApp link.'}
          {s.customer_approval === 'approved' && `✅ Customer approved on ${d8(s.customer_approved_at)} ${s.customer_approved_at?.slice(11, 16) ?? ''}`}
          {s.customer_approval === 'changes' && `✏️ Customer asked for changes: "${s.customer_note}"`}
        </div>
      )}
      <div className="card doc print-area">
        <div className="between print-head">
          <div><h2 style={{ margin: 0 }}>{company}</h2><div className="muted">{s.profile?.tagline || 'Construction Solution · Hardware · Paint · Electrical'}</div>
            <div className="muted" style={{ fontSize: 11 }}>{[s.profile?.address, s.profile?.phone, s.profile?.gstin ? `GSTIN ${s.profile.gstin}` : ''].filter(Boolean).join(' · ')}</div></div>
          <div style={{ textAlign: 'right' }}><b>{s.doc_type === 'quotation' ? 'QUOTATION' : s.status === 'final' ? 'TAX INVOICE' : 'PROFORMA INVOICE'}</b><div>{s.doc_no}</div><div className="muted">{d8(s.doc_date)}</div></div>
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
          <span>CGST {rs(Number(s.tax) / 2, 2)}</span><span>SGST {rs(Number(s.tax) / 2, 2)}</span>
          {s.charges.map((c: any, i: number) => <span key={i}>{c.label} {rs(c.amount, 2)}</span>)}
          <b>Total {rs(s.total)}</b>
        </div>
        {s.doc_type === 'invoice' && s.status === 'final' && <div className="totals"><span>Paid / adjusted {rs(s.paid_amount)}</span><b style={{ color: balance > 0.5 ? 'var(--red)' : 'var(--green)' }}>Balance {rs(balance)}</b>{s.due_date && balance > 0.5 && <span>Due {d8(s.due_date)}</span>}</div>}
        {s.notes && <p className="muted">{s.notes}</p>}
        {(s.terms || s.profile?.terms) && <div className="terms"><b>Terms & conditions</b><pre>{s.terms || s.profile.terms}</pre></div>}
        {s.profile?.bank_name && <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Bank: {s.profile.bank_name} · A/c {s.profile.account_no} · IFSC {s.profile.ifsc}{s.profile.upi_id ? ` · UPI ${s.profile.upi_id}` : ''}</div>}
      </div>
      {s.deliveries.length > 0 && (
        <div className="card no-print" style={{ marginTop: 12 }}>
          <h3 className="between">Delivery {s.deliveries.some((d: any) => d.status === 'delivered') && <button className="btn ghost sm wa" onClick={() => a.run(async () => {
            const r = await api<any>(`/erp/sales/${id}/share`, { body: { base: window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, '') } });
            const mob = String(s.party_mobile ?? s.customer_mobile ?? '').replace(/\D/g, '');
            window.open(`https://wa.me/${mob.length === 10 ? '91' + mob : mob}?text=${encodeURIComponent(`Namaste ${s.party_name} ji, your material for bill ${s.doc_no} has been delivered. Thank you!\nBill & payment: ${r.url}\n— ${company}`)}`, '_blank');
          })}>Tell customer: delivered</button>}</h3>
          {s.deliveries.map((d: any) => <div key={d.id} className="list-item between click" onClick={() => nav(`/erp/deliveries?open=${d.id}`)}><span>{d.delivery_no} · {d.assigned_name ?? 'not assigned'} · {d.address ?? ''}</span><St s={d.status} /></div>)}
        </div>
      )}
      {s.returns.length > 0 && <div className="card no-print" style={{ marginTop: 12 }}><h3>Returns</h3>{s.returns.map((r: any) => <div key={r.id} className="list-item between"><span>{r.return_no} · {d8(r.created_at)}</span><span>{rs(r.total)} <St s={r.status} /></span></div>)}</div>}
      <div className="no-print"><ApprovalTrail rows={s.approvals} /><History rows={s.history} /></div>
      {edit && <SalesForm docType={s.doc_type} doc={s} onClose={() => setEdit(false)} onSaved={() => reload()} />}
      {cancel && <ReasonModal title="Cancel this document?" onClose={() => setCancel(false)} onOk={async (reason) => { await api(`/erp/sales/${id}/cancel`, { body: { reason } }); reload(); }} />}
      {pay && <PaymentForm direction="in" partyId={s.customer_id} amount={balance} invoiceId={s.id} onClose={() => setPay(false)} onSaved={() => { setPay(false); reload(); }} />}
      {ret && <SalesReturnForm inv={s} onClose={() => setRet(false)} onSaved={() => { setRet(false); reload(); }} />}
    </>
  );
}

const REASONS: [string, string][] = [['manufacturing_defect', 'Manufacturing defect'], ['transport_damage', 'Broken / damaged in transport'], ['wrong_item', 'Wrong item sent'], ['excess_quantity', 'Extra quantity'], ['customer_changed_mind', 'Customer changed mind'], ['other', 'Other reason']];
const RESP: [string, string][] = [['manufacturer', 'Manufacturer / company'], ['transporter', 'Transporter'], ['delivery_staff', 'Our delivery staff'], ['sales_staff', 'Our sales staff'], ['store_staff', 'Our store / packing'], ['customer', 'Customer'], ['none', 'Nobody']];

/** Sales return with proof: photos / video + voice, why it came back and who is responsible. Goes to the manager for approval. */
export function SalesReturnForm({ inv, onClose, onSaved }: { inv: any; onClose: () => void; onSaved: () => void }) {
  const { meta } = useMeta();
  const [rows, setRows] = useState<any[]>(inv.items.map((i: any) => ({ ref_item_id: i.id, name: i.product_name, unit: i.unit, max: Number(i.qty) - Number(i.returned_qty), qty: 0, restock: true })));
  const [reason, setReason] = useState('');
  const [why, setWhy] = useState('manufacturing_defect');
  const [resp, setResp] = useState('manufacturer');
  const [respUser, setRespUser] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const voice = useRecorder();
  const a = useAction();
  const ok = rows.some((r) => Number(r.qty) > 0) && files.length > 0 && (reason.trim() || voice.blob) && !voice.recording;
  return (
    <Drawer title={`Sales return · ${inv.doc_no}`} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="muted" style={{ marginBottom: 8 }}>Bill by <b>{inv.created_by_name}</b>{inv.deliveries?.[0]?.assigned_name ? <> · delivered by <b>{inv.deliveries[0].assigned_name}</b></> : null} · {d8(inv.doc_date)}</div>
      <table className="t items">
        <thead><tr><th>Item</th><th>Can return</th><th>Return qty</th><th>Back to stock?</th></tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={i}><td>{r.name}</td><td>{qty(r.max)} {r.unit}</td>
            <td><input type="number" min="0" max={r.max} step="any" value={r.qty} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} style={{ width: 80 }} /></td>
            <td><input type="checkbox" checked={r.restock} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, restock: e.target.checked } : x)))} /> {r.restock ? 'Good, restock' : 'Damaged'}</td></tr>
        ))}</tbody>
      </table>
      <div className="grid g3" style={{ marginTop: 10 }}>
        <Field label="Why is it coming back *"><select value={why} onChange={(e) => setWhy(e.target.value)}>{REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Who is responsible"><select value={resp} onChange={(e) => setResp(e.target.value)}>{RESP.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {['delivery_staff', 'sales_staff', 'store_staff'].includes(resp) && <Field label="Which person"><Select value={respUser} onChange={setRespUser} options={meta?.users ?? []} /></Field>}
      </div>
      <div className={`field${!files.length ? ' invalid' : ''}`}><span>Photos / video of the material * (show the damage)</span>
        <div className="attach-list">
          {files.map((x, i) => <div key={i} className="attach-chip">{x.type.startsWith('image/') ? <img src={URL.createObjectURL(x)} alt="" /> : <span>🎬</span>}<span>{x.name.slice(0, 18)}</span><button className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>)}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📷 Add photo / video<input type="file" hidden multiple accept="image/*,video/*" capture="environment" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} /></label>
        </div>
      </div>
      <Field label="Reason — write and / or speak"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Tile corner broken in 3 boxes" /></Field>
      <VoiceNote rec={voice} label="Record reason (voice)" />
      <button className="btn" disabled={a.busy || !ok} onClick={() => a.run(async () => {
        const fd = new FormData();
        fd.append('type', 'sales'); fd.append('ref_id', String(inv.id)); fd.append('reason', reason); fd.append('reason_type', why); fd.append('responsible', resp);
        if (respUser) fd.append('responsible_user_id', respUser);
        fd.append('items', JSON.stringify(rows.filter((r) => Number(r.qty) > 0).map((r) => ({ ref_item_id: r.ref_item_id, qty: Number(r.qty), restock: r.restock }))));
        files.forEach((x) => fd.append('files[]', x));
        if (voice.blob) { fd.append('voice_note', voice.blob); fd.append('voice_duration', String(voice.secs)); }
        await api('/erp/returns', { body: fd });
        onSaved();
      })}>Send return for approval</button>
      <p className="muted">Everyone knows a return needs photo / video proof. The manager approves it; then stock comes back (if restocked) and the customer's balance is reduced.</p>
    </Drawer>
  );
}
