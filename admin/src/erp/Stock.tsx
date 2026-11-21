import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { DataTable, NoAccess, Select, Tabs, can, dt, qty, rs, useAction, useMeta, useProducts } from './common';

export default function Stock() {
  const { meta } = useMeta();
  const [sp] = useSearchParams();
  const [wh, setWh] = useState('');
  const [q, setQ] = useState('');
  const [view, setView] = useState(sp.get('low') ? 'low' : 'all');
  const [adjust, setAdjust] = useState<any>(null);
  const [transfer, setTransfer] = useState(false);
  const list = useApi<any[]>(view === 'ledger' ? null : '/erp/stock', { warehouse_id: wh, q, low: view === 'low' ? 1 : '' });
  const ledger = useApi<any[]>(view === 'ledger' ? '/erp/stock/ledger' : null);
  if (meta && !can(meta, 'inventory')) return <NoAccess />;
  const total = (list.data ?? []).reduce((s, r) => s + Number(r.value), 0);
  return (
    <>
      <Topbar title="Stock" search={q} onSearch={setQ}
        action={can(meta, 'inventory', true) ? <button className="btn ghost" onClick={() => setTransfer(true)}><Icon name="truck" /> Transfer between godowns</button> : undefined} />
      <div className="chips">
        <Tabs value={view} onChange={setView} tabs={[['all', 'All items'], ['low', 'Low stock'], ['ledger', 'Stock movements']]} />
        {view !== 'ledger' && <div style={{ marginLeft: 'auto', width: 200, marginBottom: 14 }}><Select value={wh} onChange={setWh} options={meta?.warehouses ?? []} placeholder="All godowns" /></div>}
      </div>
      {view === 'ledger' ? (
        <DataTable rows={ledger.data} cols={[
          ['When', (r) => dt(r.created_at)], ['Item', (r) => r.product_name], ['Godown', (r) => r.warehouse_name],
          ['Type', (r) => r.ref_type.replace('_', ' ')], ['Note', (r) => r.note ?? ''],
          ['Qty', (r) => <b style={{ color: Number(r.qty) < 0 ? 'var(--red)' : 'var(--green)' }}>{Number(r.qty) > 0 ? '+' : ''}{qty(r.qty)} {r.unit}</b>, 'r'], ['By', (r) => r.user_name ?? '—'],
        ]} />
      ) : (
        <>
          <DataTable rows={list.data} onRow={can(meta, 'inventory', true) && meta?.role !== 'employee' ? setAdjust : undefined} cols={[
            ['Item', (r) => <>{r.name}<div className="muted">{[r.sku, r.category_name, r.rack && `Rack ${r.rack}`].filter(Boolean).join(' · ')}</div></>],
            ['In stock', (r) => <b style={r.low ? { color: 'var(--red)' } : undefined}>{qty(r.qty)} {r.unit}{r.alt_unit && Number(r.alt_factor) > 0 ? <div className="muted" style={{ fontWeight: 400 }}>= {qty(Number(r.qty) / Number(r.alt_factor))} {r.alt_unit}</div> : null}</b>, 'r'],
            ['To deliver', (r) => (Number(r.pending_delivery) ? qty(r.pending_delivery) : '—'), 'r'],
            ['Alert at', (r) => (Number(r.min_stock) ? qty(r.min_stock) : '—'), 'r'],
            ['Value', (r) => rs(r.value), 'r'],
          ]} />
          <p className="muted" style={{ textAlign: 'right' }}>Stock value at purchase price: <b>{rs(total)}</b></p>
        </>
      )}
      {adjust && <AdjustForm p={adjust} onClose={() => setAdjust(null)} onSaved={() => { setAdjust(null); list.reload(); }} />}
      {transfer && <TransferForm onClose={() => setTransfer(false)} onSaved={() => { setTransfer(false); list.reload(); }} />}
    </>
  );
}

function AdjustForm({ p, onClose, onSaved }: { p: any; onClose: () => void; onSaved: () => void }) {
  const { meta } = useMeta();
  const [f, setF] = useState<any>({ warehouse_id: meta?.warehouses[0]?.id ?? '', new_qty: '', reason: '' });
  const a = useAction();
  return (
    <Drawer title={`Correct stock · ${p.name}`} onClose={onClose} modal>
      <ErrorBox msg={a.err} />
      <Field label="Godown"><Select value={f.warehouse_id} onChange={(v) => setF({ ...f, warehouse_id: v })} options={meta?.warehouses ?? []} /></Field>
      <Field label={`Actual quantity counted (${p.unit})`}><input type="number" value={f.new_qty} onChange={(e) => setF({ ...f, new_qty: e.target.value })} /></Field>
      <Field label="Reason (breakage, count mismatch…)"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <button className="btn" disabled={f.new_qty === '' || !f.reason || a.busy} onClick={() => a.run(async () => { await api('/erp/stock/adjust', { body: { ...f, product_id: p.id } }); onSaved(); })}>Save</button>
    </Drawer>
  );
}

function TransferForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { meta } = useMeta();
  const products = useProducts();
  const whs = meta?.warehouses ?? [];
  const [f, setF] = useState<any>({ from_warehouse_id: whs.find((w) => w.type === 'godown')?.id ?? '', to_warehouse_id: whs.find((w) => w.type === 'showroom')?.id ?? '', note: '' });
  const [items, setItems] = useState<{ product_id: string; qty: string }[]>([{ product_id: '', qty: '' }]);
  const a = useAction();
  return (
    <Drawer title="Transfer stock" onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="grid g2">
        <Field label="From"><Select value={f.from_warehouse_id} onChange={(v) => setF({ ...f, from_warehouse_id: v })} options={whs} /></Field>
        <Field label="To"><Select value={f.to_warehouse_id} onChange={(v) => setF({ ...f, to_warehouse_id: v })} options={whs} /></Field>
      </div>
      {items.map((it, i) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <select value={it.product_id} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))} style={{ flex: 1 }}>
            <option value="">Item</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input type="number" placeholder="Qty" value={it.qty} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} style={{ width: 90 }} />
        </div>
      ))}
      <button className="link" onClick={() => setItems([...items, { product_id: '', qty: '' }])}>+ Add item</button>
      <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api('/erp/stock/transfer', { body: { ...f, items: items.filter((x) => x.product_id && Number(x.qty) > 0) } }); onSaved(); })}>Transfer</button>
    </Drawer>
  );
}
