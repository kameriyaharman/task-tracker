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
  const entity = tab === 'setup' ? null : tab;
  const list = useApi<any[]>(entity ? `/erp/masters/${entity}` : null, { q, all: 1 });
  if (meta && !can(meta, 'masters') && !can(meta, 'sales') && !can(meta, 'purchase')) return <NoAccess />;
  const w = can(meta, 'masters', true);
  return (
    <>
      <Topbar title="Masters" search={q} onSearch={setQ}
        action={entity && w ? <div className="row">
          {entity === 'products' && <button className="btn ghost" onClick={() => setImporting(true)}><Icon name="download" /> Import</button>}
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
        <DataTable rows={list.data} onRow={setEdit} cols={[
          ['Name', (r) => <><b style={{ fontWeight: 500, opacity: +r.is_active ? 1 : 0.5 }}>{r.name}</b><div className="muted">{[r.contact_person, r.city, r.gstin].filter(Boolean).join(' · ')}</div></>],
          ['Mobile', (r) => r.mobile ?? '—'],
          ...(tab === 'customers' ? [['Type', (r: any) => r.type] as [string, (r: any) => any], ['Credit limit', (r: any) => rs(r.credit_limit), 'r'] as [string, (r: any) => any, 'r']] : []),
          ['Credit days', (r) => r.credit_days, 'r'],
          [tab === 'customers' ? 'They owe' : 'We owe', (r) => <b style={{ color: Number(r.outstanding) > 0 ? 'var(--red)' : undefined }}>{rs(r.outstanding)}</b>, 'r'],
        ]} />
      )}
      {tab === 'setup' && <Setup />}
      {edit && entity === 'products' && <ProductForm p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={!w} />}
      {edit && (entity === 'customers' || entity === 'vendors') && <PartyForm kind={entity} p={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); list.reload(); }} readOnly={!w} />}
      {importing && <ImportProducts onClose={() => setImporting(false)} onDone={() => { setImporting(false); list.reload(); }} />}
    </>
  );
}

function ProductForm({ p, onClose, onSaved, readOnly }: { p: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const { meta } = useMeta();
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
          <Field label="Category"><Select value={f.category_id} onChange={(v) => set('category_id', v)} options={meta?.categories ?? []} /></Field>
          <Field label="Brand"><Select value={f.brand_id} onChange={(v) => set('brand_id', v)} options={meta?.brands ?? []} /></Field>
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

function PartyForm({ kind, p, onClose, onSaved, readOnly }: { kind: 'customers' | 'vendors'; p: any; onClose: () => void; onSaved: () => void; readOnly: boolean }) {
  const { meta } = useMeta();
  const [f, setF] = useState<any>({ type: 'retail', credit_days: kind === 'vendors' ? 30 : 0, credit_limit: 0, opening_balance: 0, is_active: 1, ...p });
  const set = (k: string, v: any) => setF((s: any) => ({ ...s, [k]: v }));
  const st = useApi<any>(p.id ? `/erp/statement` : null, { party: kind === 'customers' ? 'customer' : 'vendor', id: p.id });
  const a = useAction();
  const save = () => a.run(async () => {
    const keys = kind === 'customers'
      ? ['name', 'type', 'mobile', 'email', 'gstin', 'address', 'city', 'credit_limit', 'credit_days', 'opening_balance', 'recovery_user_id', 'is_active']
      : ['name', 'contact_person', 'mobile', 'email', 'gstin', 'address', 'city', 'credit_days', 'opening_balance', 'is_active'];
    const body = Object.fromEntries(keys.filter((k) => k in f).map((k) => [k, f[k]]));
    if (p.id) await api(`/erp/masters/${kind}/${p.id}`, { method: 'PATCH', body }); else await api(`/erp/masters/${kind}`, { body });
    onSaved();
  });
  return (
    <Drawer title={p.id ? f.name : `Add ${kind.slice(0, -1)}`} onClose={onClose}>
      <ErrorBox msg={a.err} />
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0 }}>
        <Field label="Name"><input value={f.name ?? ''} onChange={(e) => set('name', e.target.value)} /></Field>
        <div className="grid g2">
          {kind === 'customers'
            ? <Field label="Customer type (decides price)"><select value={f.type} onChange={(e) => set('type', e.target.value)}><option value="retail">Retail</option><option value="wholesale">Wholesale / shop</option><option value="contractor">Contractor</option></select></Field>
            : <Field label="Contact person"><input value={f.contact_person ?? ''} onChange={(e) => set('contact_person', e.target.value)} /></Field>}
          <Field label="Mobile"><input value={f.mobile ?? ''} onChange={(e) => set('mobile', e.target.value)} /></Field>
          <Field label="GSTIN"><input value={f.gstin ?? ''} onChange={(e) => set('gstin', e.target.value.toUpperCase())} /></Field>
          <Field label="City"><input value={f.city ?? ''} onChange={(e) => set('city', e.target.value)} /></Field>
          {kind === 'customers' && <Field label="Credit limit (₹)"><input type="number" value={f.credit_limit} onChange={(e) => set('credit_limit', e.target.value)} /></Field>}
          <Field label="Credit days"><input type="number" value={f.credit_days} onChange={(e) => set('credit_days', e.target.value)} /></Field>
          <Field label={kind === 'customers' ? 'Old dues (opening balance)' : 'Opening balance we owe'}><input type="number" value={f.opening_balance} onChange={(e) => set('opening_balance', e.target.value)} /></Field>
          {kind === 'customers' && <Field label="Recovery person"><Select value={f.recovery_user_id} onChange={(v) => set('recovery_user_id', v)} options={meta?.users ?? []} /></Field>}
        </div>
        <Field label="Address"><input value={f.address ?? ''} onChange={(e) => set('address', e.target.value)} /></Field>
        {p.id && <label className="check"><input type="checkbox" checked={!!+f.is_active} onChange={(e) => set('is_active', e.target.checked ? 1 : 0)} /> Active</label>}
        {!readOnly && <button className="btn" disabled={!f.name || a.busy} onClick={save}>Save</button>}
      </fieldset>
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
    </Drawer>
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
