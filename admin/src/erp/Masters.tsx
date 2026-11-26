import { DateInput } from '../dateinput';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { DataTable, History, NoAccess, Select, Tabs, can, qty, rs, useAction, useMeta } from './common';

const TABS: [string, string][] = [['products', 'Products'], ['customers', 'Customers'], ['vendors', 'Vendors'], ['setup', 'Godowns, categories & units']];

export default function Masters() {
  const { tab = 'products' } = useParams();
  const nav = useNavigate();
  const { meta } = useMeta();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [showPeople, setShowPeople] = useState(false);
  const entity = tab === 'setup' ? null : tab;
  const list = useApi<any[]>(entity ? `/erp/masters/${entity}` : null, { q, all: 1 });
  if (meta && !can(meta, 'masters') && !can(meta, 'sales') && !can(meta, 'purchase')) return <NoAccess />;
  const w = can(meta, 'masters', true);
  return (
    <>
      <Topbar title="Masters" search={q} onSearch={setQ}
        action={entity && w ? <div className="row">
          {entity === 'products' && <button className="btn ghost" onClick={() => setImporting(true)}><Icon name="download" /> Import</button>}
          {entity === 'customers' && <button className="btn ghost" onClick={() => setShowPeople(!showPeople)}>👤 Sales persons</button>}
          <button className="btn" onClick={() => setEdit({})}><Icon name="plus" /> Add {entity.slice(0, -1)}</button>
        </div> : undefined} />
      <Tabs value={tab} onChange={(t) => nav(`/erp/masters/${t}`)} tabs={TABS} />
      {tab === 'products' && (
        <DataTable rows={list.data} onRow={setEdit} cols={[
          ['Product', (r) => <><b style={{ fontWeight: 500, opacity: +r.is_active ? 1 : 0.5 }}>{r.name}</b><div className="muted">{[r.sku, r.barcode, r.category_name, r.brand_name].filter(Boolean).join(' · ')}</div></>],
          ['Unit', (r) => r.unit + (r.alt_unit ? ` (1 ${r.alt_unit} = ${qty(r.alt_factor)} ${r.unit})` : '')],
          ['HSN / GST', (r) => `${r.hsn ?? '—'} · ${qty(r.gst_rate)}%`],
          ['Purchase', (r) => rs(r.purchase_price, 2), 'r'], ['Retail', (r) => rs(r.retail_price, 2), 'r'],
          ['Wholesale', (r) => rs(r.wholesale_price, 2), 'r'], ['Contractor', (r) => rs(r.contractor_price, 2), 'r'],
          ['Stock', (r) => <span style={Number(r.min_stock) > 0 && Number(r.stock) <= Number(r.min_stock) ? { color: 'var(--red)', fontWeight: 600 } : undefined}>{qty(r.stock)}</span>, 'r'],
        ]} />
      )}
      {(tab === 'customers' || tab === 'vendors') && (
        <>
        {tab === 'customers' && showPeople && <SalesPeople onDone={list.reload} />}
        <DataTable rows={list.data} onRow={setEdit} cols={[
          ['#', (r) => <b>{r.code ?? '—'}</b>],
          ['Name', (r) => <><b style={{ fontWeight: 500, opacity: +r.is_active ? 1 : 0.5 }}>{r.business_name || r.name}</b><div className="muted">{[r.business_name ? r.name : null, r.contact_person, r.city, r.gstin].filter(Boolean).join(' · ')}</div></>],
          ['Mobile', (r) => r.mobile ?? '—'],
          ['Rating', (r) => <Rating r={r.rating} />],
          ...(tab === 'customers' ? [['Type', (r: any) => r.type] as [string, (r: any) => any], ['Sales person', (r: any) => r.sales_user_name ?? '—'] as [string, (r: any) => any], ['Credit limit', (r: any) => rs(r.credit_limit), 'r'] as [string, (r: any) => any, 'r']] : []),
          ['Credit days', (r) => r.credit_days, 'r'],
          [tab === 'customers' ? 'They owe' : 'We owe', (r) => <b style={{ color: Number(r.outstanding) > 0 ? 'var(--red)' : undefined }}>{rs(r.outstanding)}</b>, 'r'],
        ]} />
        </>
      )}
      {tab === 'setup' && <Setup />}
      {edit && entity === 'products' && <ProductForm p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={!w} />}
      {edit && (entity === 'customers' || entity === 'vendors') && <PartyForm kind={entity} p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={!w} />}
      {importing && <ImportProducts onClose={() => setImporting(false)} onDone={() => { setImporting(false); list.reload(); }} />}
    </>
  );
}

/** Select with an "＋ Add new" option right there (category / brand). */
function QuickAdd({ entity, value, onChange, options, onAdded }: { entity: string; value: any; onChange: (v: any) => void; options: any[]; onAdded: () => void }) {
  const [adding, setAdding] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (adding !== null) return (
    <div className="row" style={{ gap: 4 }}>
      <input className="input" style={{ flex: 1 }} value={adding} onChange={(e) => setAdding(e.target.value)} placeholder={`New ${entity === 'brands' ? 'brand' : 'category'}`} autoFocus />
      <button type="button" className="btn sm" disabled={!adding.trim()} onClick={async () => {
        try { const r = await api<any>(`/erp/masters/${entity}`, { body: { name: adding.trim() } }); onAdded(); onChange(r.id); setAdding(null); } catch (e) { setErr((e as Error).message); }
      }}>Add</button>
      <button type="button" className="link" onClick={() => setAdding(null)}>✕</button>
      {err && <small className="field-err">{err}</small>}
    </div>
  );
  return (
    <select value={value ?? ''} onChange={(e) => (e.target.value === '__add' ? setAdding('') : onChange(e.target.value))}>
      <option value="">—</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
      <option value="__add">＋ Add new {entity === 'brands' ? 'brand' : 'category'}…</option>
    </select>
  );
}

function ProductForm({ p, onClose, onSaved, readOnly }: { p: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const { meta, reload: reloadMeta } = useMeta();
  const full = useApi<any>(p.id ? `/erp/masters/products/${p.id}` : null);
  const [f, setF] = useState<any>({ unit: 'Piece', gst_rate: 18, is_active: 1, purchase_price: 0, retail_price: 0, wholesale_price: 0, contractor_price: 0, min_stock: 0, ...p });
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const a = useAction();
  const save = () => a.run(async () => {
    const keys = ['sku', 'barcode', 'name', 'category_id', 'brand_id', 'unit', 'alt_unit', 'alt_factor', 'hsn', 'gst_rate', 'purchase_price', 'retail_price', 'wholesale_price', 'contractor_price', 'min_stock', 'rack', 'is_active', 'opening_stock', 'warehouse_id'];
    const body = Object.fromEntries(keys.filter((k) => k in f).map((k) => [k, f[k]]));
    if (p.id) await api(`/erp/masters/products/${p.id}`, { method: 'PATCH', body }); else await api('/erp/masters/products', { body });
    onSaved();
  });
  return (
    <Drawer title={p.id ? f.name : 'Add product'} onClose={onClose}>
      <ErrorBox msg={a.err} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <Field label="Product name"><input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} placeholder="e.g. UltraTech OPC 53 Cement 50kg" /></Field>
        <div className="grid g2">
          <Field label="Category"><QuickAdd entity="categories" value={f.category_id} onChange={(v) => set('category_id', v)} options={meta?.categories ?? []} onAdded={reloadMeta} /></Field>
          <Field label="Brand"><QuickAdd entity="brands" value={f.brand_id} onChange={(v) => set('brand_id', v)} options={meta?.brands ?? []} onAdded={reloadMeta} /></Field>
          <Field label="SKU / code"><input value={f.sku ?? ''} onChange={(e) => set('sku', e.target.value)} /></Field>
          <Field label="Barcode"><input value={f.barcode ?? ''} onChange={(e) => set('barcode', e.target.value)} placeholder="Scan here" /></Field>
          <Field label="Unit"><select value={f.unit} onChange={(e) => set('unit', e.target.value)}>{(meta?.units ?? []).map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label="Rack / location"><input value={f.rack ?? ''} onChange={(e) => set('rack', e.target.value)} /></Field>
          <Field label="Bigger unit (optional)"><select value={f.alt_unit ?? ''} onChange={(e) => set('alt_unit', e.target.value)}><option value="">—</option>{(meta?.units ?? []).map((u) => <option key={u}>{u}</option>)}</select></Field>
          <Field label={`1 ${f.alt_unit || 'bigger unit'} = how many ${f.unit}`}><input type="number" value={f.alt_factor ?? ''} onChange={(e) => set('alt_factor', e.target.value)} /></Field>
          <Field label="HSN code"><input value={f.hsn ?? ''} onChange={(e) => set('hsn', e.target.value)} /></Field>
          <Field label="GST %"><select value={f.gst_rate} onChange={(e) => set('gst_rate', e.target.value)}>{[0, 5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select></Field>
          <Field label="Purchase price (excl. GST)"><input type="number" value={f.purchase_price} onChange={(e) => set('purchase_price', e.target.value)} /></Field>
          <Field label="Retail price"><input type="number" value={f.retail_price} onChange={(e) => set('retail_price', e.target.value)} /></Field>
          <Field label="Wholesale price"><input type="number" value={f.wholesale_price} onChange={(e) => set('wholesale_price', e.target.value)} /></Field>
          <Field label="Contractor price"><input type="number" value={f.contractor_price} onChange={(e) => set('contractor_price', e.target.value)} /></Field>
          <Field label="Low-stock alert at"><input type="number" value={f.min_stock} onChange={(e) => set('min_stock', e.target.value)} /></Field>
          {!p.id && <Field label="Opening stock"><input type="number" value={f.opening_stock ?? ''} onChange={(e) => set('opening_stock', e.target.value)} /></Field>}
          {!p.id && <Field label="Opening stock in"><Select value={f.warehouse_id} onChange={(v) => set('warehouse_id', v)} options={meta?.warehouses ?? []} placeholder="Showroom" /></Field>}
        </div>
        {p.id && <label className="check"><input type="checkbox" checked={!!+f.is_active} onChange={(e) => set('is_active', e.target.checked ? 1 : 0)} /> Active</label>}
        {!readOnly && <button className="btn" disabled={!f.name || a.busy} onClick={save}>Save</button>}
      </fieldset>
      {full.data && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Stock by godown</h3>
          {full.data.stock.map((s: any) => <div key={s.warehouse_id} className="list-item between"><span>{s.name}</span><b>{qty(s.qty)} {f.unit}</b></div>)}
          <h3 style={{ marginTop: 12 }}>Last movements</h3>
          {full.data.ledger.slice(0, 15).map((l: any) => (
            <div key={l.id} className="list-item between">
              <span>{l.ref_type.replace('_', ' ')} <span className="muted">{l.note} · {l.warehouse_name}</span></span>
              <b style={{ color: Number(l.qty) < 0 ? 'var(--red)' : 'var(--green)' }}>{Number(l.qty) > 0 ? '+' : ''}{qty(l.qty)}</b>
            </div>
          ))}
        </div>
      )}
      <History rows={full.data?.history} />
    </Drawer>
  );
}

const RATING_COLOR: Record<string, string> = { Platinum: '#5b6b8c', Gold: '#b8860b', Silver: '#7d7d7d', Regular: '#a99' };
export const Rating = ({ r }: { r?: string }) => (r ? <span className="badge" style={{ color: RATING_COLOR[r] ?? undefined, borderColor: RATING_COLOR[r] ?? undefined }}>{r === 'Platinum' ? '💎 ' : r === 'Gold' ? '🥇 ' : r === 'Silver' ? '🥈 ' : ''}{r}</span> : null);

/** Customer / vendor master — business details, contacts, addresses, wishes, PAN, bank details, documents. */
function PartyForm({ kind, p, onClose, onSaved, readOnly }: { kind: 'customers' | 'vendors'; p: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const { meta } = useMeta();
  const isC = kind === 'customers';
  const full = useApi<any>(p.id ? `/erp/masters/${kind}/${p.id}` : null);
  const types = useApi<any[]>(isC ? '/erp/customer-types' : null);
  const [f, setF] = useState<any>({ type: 'Retail Customer', credit_days: isC ? 0 : 30, credit_limit: 0, opening_balance: 0, is_active: 1, ...p, contacts: p.contacts?.length ? p.contacts : [] });
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const st = useApi<any>(p.id ? `/erp/statement` : null, { party: isC ? 'customer' : 'vendor', id: p.id });
  const [newType, setNewType] = useState<{ name: string; price_type: string } | null>(null);
  const [docLabel, setDocLabel] = useState('GST certificate');
  const a = useAction();
  const save = () => a.run(async () => {
    const common = ['code', 'name', 'business_name', 'contacts', 'mobile', 'whatsapp', 'email', 'gstin', 'pan', 'address', 'billing_address', 'city', 'state', 'pincode', 'dob', 'anniversary', 'credit_days', 'opening_balance', 'notes', 'is_active'];
    const keys = isC ? [...common, 'type', 'credit_limit', 'recovery_user_id', 'sales_user_id'] : [...common, 'contact_person', 'bank_name', 'account_holder', 'account_no', 'ifsc', 'upi_id'];
    const body = Object.fromEntries(keys.filter((k) => k in f).map((k) => [k, f[k] === '' ? null : f[k]]));
    if (p.id) await api(`/erp/masters/${kind}/${p.id}`, { method: 'PATCH', body }); else await api(`/erp/masters/${kind}`, { body });
    onSaved();
  });
  const upload = (files: FileList | null) => files?.length && a.run(async () => {
    const fd = new FormData(); Array.from(files).forEach((x) => fd.append('files[]', x)); fd.append('label', docLabel);
    await api(`/erp/files/${isC ? 'customer' : 'vendor'}/${p.id}`, { body: fd }); full.reload();
  });
  const token = localStorage.getItem('wt_token');
  const setContact = (i: number, k: string, v: string) => set('contacts', f.contacts.map((c: any, j: number) => (j === i ? { ...c, [k]: v } : c)));
  const d = full.data;
  return (
    <Drawer title={p.id ? `${f.code ? `#${f.code} · ` : ''}${f.business_name || f.name}` : `Add ${isC ? 'customer' : 'vendor'}`} onClose={onClose} wide>
      <ErrorBox msg={a.err} />
      {d && (
        <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          <Rating r={d.rating} /><span className="muted">{isC ? 'Bought' : 'Supplied'} {rs(d.business_12m)} in last 12 months</span>
          {d.dob_in_days !== null && d.dob_in_days <= 15 && <span className="badge">🎂 Birthday in {d.dob_in_days} days</span>}
          {d.anniversary_in_days !== null && d.anniversary_in_days <= 15 && <span className="badge">💐 Anniversary in {d.anniversary_in_days} days</span>}
        </div>
      )}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <div className="grid g2">
          <Field label="Business / firm name"><input value={f.business_name ?? ''} onChange={(e) => set('business_name', e.target.value)} placeholder={isC ? 'e.g. Sharma Builders' : 'e.g. UltraTech Dealer — Rewari'} /></Field>
          <Field label="Owner / person name *"><input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        </div>
        <Field label="Address"><input value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} placeholder="Shop / site address" /></Field>
        <div className="grid g3">
          <Field label="City"><input value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
          <Field label="State"><input value={f.state ?? ''} onChange={(e) => set('state', e.target.value)} /></Field>
          <Field label="PIN code"><input value={f.pincode ?? ''} onChange={(e) => set('pincode', e.target.value)} /></Field>
        </div>
        <Field label={`Billing address ${isC ? '(printed on the bill)' : ''}`}>
          <input value={f.billing_address ?? ''} onChange={(e) => set('billing_address', e.target.value)} placeholder="Same as address if empty" />
        </Field>
        <div className="grid g3">
          <Field label="Code (short ID)"><input value={f.code ?? ''} onChange={(e) => set('code', e.target.value)} placeholder="auto" /></Field>
          <Field label="Mobile"><input value={f.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} /></Field>
          <Field label="WhatsApp no."><input value={f.whatsapp ?? ''} onChange={(e) => set('whatsapp', e.target.value)} placeholder="same as mobile if empty" /></Field>
          <Field label="Email"><input type="email" value={f.email ?? ''} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="GSTIN"><input value={f.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} maxLength={15} /></Field>
          <Field label="PAN (optional)"><input value={f.pan ?? ''} onChange={(e) => set('pan', e.target.value.toUpperCase())} maxLength={10} placeholder="ABCDE1234F" /></Field>
          <Field label="Date of birth"><DateInput value={f.dob ?? ''} onChange={(e) => set('dob', e.target.value)} /></Field>
          <Field label="Anniversary"><DateInput value={f.anniversary ?? ''} onChange={(e) => set('anniversary', e.target.value)} /></Field>
          {isC && (
            <Field label="Customer type (decides price)">
              <div className="row" style={{ gap: 4 }}>
                <select style={{ flex: 1 }} value={f.type} onChange={(e) => (e.target.value === '__add' ? setNewType({ name: '', price_type: 'retail' }) : set('type', e.target.value))}>
                  {(types.data ?? []).map((t) => <option key={t.id} value={t.name}>{t.name} · {t.price_type} price</option>)}
                  <option value="__add">＋ Add new type…</option>
                </select>
              </div>
            </Field>
          )}
        </div>
        {newType && (
          <div className="card row" style={{ padding: 10, marginBottom: 10, flexWrap: 'wrap' }}>
            <input className="input" style={{ flex: 1, minWidth: 140 }} value={newType.name} onChange={(e) => setNewType({ ...newType, name: e.target.value })} placeholder="e.g. Plumber, Electrician" autoFocus />
            <select className="input" style={{ width: 170 }} value={newType.price_type} onChange={(e) => setNewType({ ...newType, price_type: e.target.value })}>
              <option value="retail">uses Retail price</option><option value="wholesale">uses Wholesale price</option><option value="contractor">uses Contractor price</option>
            </select>
            <button className="btn sm" disabled={!newType.name.trim()} onClick={() => a.run(async () => { await api('/erp/customer-types', { body: newType }); await types.reload(); set('type', newType.name.trim()); setNewType(null); })}>Add type</button>
            <button className="link" onClick={() => setNewType(null)}>Cancel</button>
          </div>
        )}

        <div className="field"><span>Contact persons</span>
          {!isC && <input className="input" style={{ marginBottom: 6 }} value={f.contact_person ?? ''} onChange={(e) => set('contact_person', e.target.value)} placeholder="Main contact person" />}
          {f.contacts.map((c: any, i: number) => (
            <div key={i} className="row" style={{ marginBottom: 6, gap: 6 }}>
              <input className="input" style={{ flex: 2 }} value={c.name} onChange={(e) => setContact(i, 'name', e.target.value)} placeholder="Name" />
              <input className="input" style={{ flex: 2 }} value={c.mobile} onChange={(e) => setContact(i, 'mobile', e.target.value)} placeholder="Mobile" />
              <input className="input" style={{ flex: 2 }} value={c.role ?? ''} onChange={(e) => setContact(i, 'role', e.target.value)} placeholder="Munshi / accounts / site" />
              <button type="button" className="link" onClick={() => set('contacts', f.contacts.filter((_: any, j: number) => j !== i))}>✕</button>
            </div>
          ))}
          <button type="button" className="btn ghost sm" onClick={() => set('contacts', [...f.contacts, { name: '', mobile: '', role: '' }])}>＋ Add contact / number</button>
        </div>

        <h3 style={{ marginTop: 14 }}>Credit & people</h3>
        <div className="grid g3">
          {isC && <Field label="Credit limit (₹)"><input type="number" value={f.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} /></Field>}
          <Field label="Credit days"><input type="number" value={f.credit_days} onChange={(e) => set('credit_days', e.target.value)} /></Field>
          <Field label={isC ? 'Old dues (opening balance)' : 'Opening balance we owe'}><input type="number" value={f.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} /></Field>
          {isC && <Field label="Sales person"><Select value={f.sales_user_id} onChange={(v) => set('sales_user_id', v)} options={meta?.users ?? []} /></Field>}
          {isC && <Field label="Recovery person"><Select value={f.recovery_user_id} onChange={(v) => set('recovery_user_id', v)} options={meta?.users ?? []} /></Field>}
        </div>
        {!isC && (
          <>
            <h3 style={{ marginTop: 14 }}>Bank details (for paying this vendor)</h3>
            <div className="grid g3">
              <Field label="Bank name"><input value={f.bank_name ?? ''} onChange={(e) => set('bank_name', e.target.value)} /></Field>
              <Field label="Account holder"><input value={f.account_holder ?? ''} onChange={(e) => set('account_holder', e.target.value)} /></Field>
              <Field label="Account no."><input value={f.account_no ?? ''} onChange={(e) => set('account_no', e.target.value)} /></Field>
              <Field label="IFSC"><input value={f.ifsc ?? ''} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} maxLength={11} placeholder="SBIN0001234" /></Field>
              <Field label="UPI ID"><input value={f.upi_id ?? ''} onChange={(e) => set('upi_id', e.target.value)} placeholder="name@bank" /></Field>
            </div>
          </>
        )}
        <Field label="Notes"><input value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value)} /></Field>
        {p.id && <label className="check"><input type="checkbox" checked={!!+f.is_active} onChange={(e) => set('is_active', e.target.checked ? 1 : 0)} /> Active</label>}
        {!readOnly && <button className="btn" disabled={!f.name || a.busy} onClick={save}>Save</button>}
      </fieldset>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Documents (GST certificate, visiting card{isC ? '' : ', blank cheque'}…)</h3>
        {!p.id ? <p className="muted">Save first, then attach documents.</p> : (
          <>
            {(d?.files ?? []).map((x: any) => (
              <div key={x.id} className="list-item between">
                <a href={`/api/files/${x.id}?token=${token}`} target="_blank" rel="noreferrer">📄 {x.file_name}</a>
                {!readOnly && <button className="link" onClick={() => confirm('Remove this document?') && a.run(async () => { await api(`/erp/files/${x.id}`, { method: 'DELETE' }); full.reload(); })}>Remove</button>}
              </div>
            ))}
            {!readOnly && (
              <div className="row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                <select className="input" style={{ width: 190 }} value={docLabel} onChange={(e) => setDocLabel(e.target.value)}>
                  {['GST certificate', 'Visiting card', 'PAN card', 'Aadhaar', ...(isC ? ['Agreement'] : ['Blank cheque', 'Bank proof', 'Price list']), 'Other'].map((x) => <option key={x}>{x}</option>)}
                </select>
                <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📎 Attach<input type="file" hidden multiple accept="image/*,.pdf" onChange={(e) => { upload(e.target.files); e.target.value = ''; }} /></label>
              </div>
            )}
          </>
        )}
      </div>

      {d?.bills?.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Unpaid bills (balance & age)</h3>
          {d.bills.map((b: any) => (
            <div key={b.id} className="list-item between">
              <span>{b.no}{b.po_no ? <span className="muted"> · PO {b.po_no}</span> : null} <span className="muted">· {b.dt}</span></span>
              <span><b>{rs(b.due)}</b> <span className="muted">of {rs(b.total)}</span> <span className={`badge ${+b.age > 60 ? 'overdue' : ''}`}>{b.age} days</span></span>
            </div>
          ))}
        </div>
      )}
      {st.data && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3 className="between">Ledger <span>Balance {rs(st.data.closing, 2)}</span></h3>
          <div className="list-item between muted"><span>Opening balance</span><span>{rs(st.data.opening, 2)}</span></div>
          {st.data.rows.slice(-30).map((r: any, i: number) => (
            <div key={i} className="list-item between">
              <span>{r.kind} <span className="muted">{r.no} · {r.dt}</span></span>
              <span>{Number(r.debit) > 0 ? rs(r.debit, 2) + ' Dr' : rs(r.credit, 2) + ' Cr'} <span className="muted">→ {rs(r.balance)}</span></span>
            </div>
          ))}
        </div>
      )}
      <History rows={d?.history} />
    </Drawer>
  );
}

/** Sales person handover: move all customers of one person to another (when someone leaves) + who handles how many. */
function SalesPeople({ onDone }: { onDone: () => void }) {
  const { meta } = useMeta();
  const by = useApi<any[]>('/erp/masters/customers/by-person');
  const [f, setF] = useState({ from_user: '', to_user: '', field: 'sales' });
  const [msg, setMsg] = useState<string | null>(null);
  const a = useAction();
  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <ErrorBox msg={a.err} />
      <h3>Customers by sales person</h3>
      <div className="row" style={{ flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {(by.data ?? []).map((u) => <span key={u.id} className="chip">{u.name}{+u.is_active ? '' : ' (left)'} · <b>{u.customers}</b> · {rs(u.business_12m)}</span>)}
        {!by.data?.length && <span className="muted">No customer has a sales person yet — set it in each customer.</span>}
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span>Move all customers of</span>
        <div style={{ width: 170 }}><Select value={f.from_user} onChange={(v) => setF({ ...f, from_user: v })} options={meta?.users ?? []} /></div>
        <span>to</span>
        <div style={{ width: 170 }}><Select value={f.to_user} onChange={(v) => setF({ ...f, to_user: v })} options={meta?.users ?? []} /></div>
        <select className="input" style={{ width: 150 }} value={f.field} onChange={(e) => setF({ ...f, field: e.target.value })}><option value="sales">as sales person</option><option value="recovery">as recovery person</option></select>
        <button className="btn sm" disabled={!f.from_user || !f.to_user || a.busy} onClick={() => a.run(async () => { const r = await api<any>('/erp/masters/customers/reassign', { body: f }); setMsg(`${r.moved} customers moved`); by.reload(); onDone(); })}>Move</button>
        {msg && <span className="ok-text">✓ {msg}</span>}
      </div>
    </div>
  );
}

function Setup() {
  const { meta, reload } = useMeta();
  const w = useApi<any[]>('/erp/masters/warehouses', { all: 1 });
  const lists: [string, string, any[] | undefined][] = [['categories', 'Categories', meta?.categories], ['brands', 'Brands', meta?.brands]];
  const [names, setNames] = useState<Record<string, string>>({});
  const a = useAction();
  const add = (entity: string, extra: any = {}) => a.run(async () => {
    await api(`/erp/masters/${entity}`, { body: { name: names[entity], ...extra } });
    setNames((n) => ({ ...n, [entity]: '' })); reload(); w.reload();
  });
  const box = (entity: string, title: string, items: { id: any; name: string; type?: string }[] | undefined, extra?: any) => (
    <div className="card" key={entity}>
      <h3>{title}</h3>
      {(items ?? []).map((x) => <div key={x.id ?? x.name} className="list-item between"><span>{x.name}</span>{x.type && <span className="muted">{x.type}</span>}</div>)}
      {can(meta, 'masters', true) && (
        <div className="row" style={{ marginTop: 10 }}>
          <input className="input" value={names[entity] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [entity]: e.target.value }))} placeholder={{ warehouses: 'New godown / showroom', categories: 'New category', brands: 'New brand', units: 'New unit' }[entity] ?? 'New'} />
          <button className="btn sm" disabled={!names[entity]} onClick={() => add(entity, extra)}>Add</button>
        </div>
      )}
    </div>
  );
  return (
    <>
      <ErrorBox msg={a.err} />
      <div className="grid g4">
        {box('warehouses', 'Godowns / showrooms', w.data ?? undefined, { type: 'godown' })}
        {lists.map(([e, t, items]) => box(e, t, items))}
        {box('units', 'Units', (meta?.units ?? []).map((u) => ({ id: u, name: u })))}
      </div>
    </>
  );
}

/** CSV import: name, sku, barcode, category, unit, hsn, gst_rate, purchase_price, retail_price, wholesale_price, contractor_price, min_stock, opening_stock */
function ImportProducts({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { meta } = useMeta();
  const [rows, setRows] = useState<any[]>([]);
  const [wh, setWh] = useState('');
  const [res, setRes] = useState<any>(null);
  const a = useAction();
  const parse = (text: string) => {
    const lines = text.replace(/\r/g, '').split('\n').filter((l) => l.trim());
    const split = (l: string) => { const out: string[] = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((s) => s.trim()); };
    const head = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, ''));
    setRows(lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v]))));
  };
  const template = 'name,sku,barcode,category,unit,hsn,gst_rate,purchase_price,retail_price,wholesale_price,contractor_price,min_stock,opening_stock\nUltraTech OPC 53 Cement 50kg,CEM-UT53,,Cement,Bag,2523,28,350,420,400,390,50,0\n';
  return (
    <Drawer title="Import products from Excel / CSV" onClose={onClose}>
      <ErrorBox msg={a.err} />
      <p className="muted">Save your Excel sheet as <b>CSV</b> with these columns (first row = headings). Same name or SKU updates the product.</p>
      <a className="link" href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`} download="products-template.csv">Download template</a>
      <div style={{ margin: '12px 0' }}><input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0]?.text().then(parse)} /></div>
      <Field label="Opening stock goes to"><Select value={wh} onChange={setWh} options={meta?.warehouses ?? []} placeholder="Showroom" /></Field>
      {rows.length > 0 && <p><b>{rows.length}</b> products ready · first: {rows[0].name}</p>}
      {res && <p className="muted">Created {res.created}, updated {res.updated}</p>}
      <button className="btn" disabled={!rows.length || a.busy} onClick={() => a.run(async () => { setRes(await api('/erp/masters/products/import', { body: { rows, warehouse_id: wh || null } })); setTimeout(onDone, 1200); })}>Import</button>
    </Drawer>
  );
}
