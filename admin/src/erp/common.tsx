import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { useRecorder, VoiceNote } from '../voice';
import { useApi } from '../hooks';
import { Badge, Drawer, Empty, ErrorBox, Icon } from '../ui';

export type Meta = {
  perms: Record<string, 'view' | 'edit'>; role: string; erp_role: string | null;
  warehouses: { id: number; name: string; type: string }[]; units: string[];
  categories: { id: number; name: string }[]; brands: { id: number; name: string }[];
  erp_roles: { id: number; name: string }[];
  users: { id: number; name: string; role: string; erp_role_id: number | null; erp_role: string | null }[];
  pending_approvals: number; doc_labels: Record<string, string>;
};

const MetaCtx = createContext<{ meta: Meta | null; reload: () => void }>({ meta: null, reload: () => {} });

export function MetaProvider({ children }: { children: ReactNode }) {
  const m = useApi<Meta>('/erp/meta');
  return <MetaCtx.Provider value={{ meta: m.data, reload: m.reload }}>{children}</MetaCtx.Provider>;
}
export const useMeta = () => useContext(MetaCtx);
export const can = (meta: Meta | null, mod: string, write = false) => {
  const p = meta?.perms?.[mod];
  return write ? p === 'edit' : p === 'view' || p === 'edit';
};

// ───────── formatting ─────────
export const rs = (n: number | string | null | undefined, dec = 0) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec === 0 ? 0 : 2 });
export const qty = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return Number.isInteger(v) ? v.toLocaleString('en-IN') : v.toLocaleString('en-IN', { maximumFractionDigits: 3 });
};
export const d8 = (s?: string | null) => (s ? new Date(s.replace(' ', 'T')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' }) : '—');
export const dt = (s?: string | null) =>
  s ? new Date(s.replace(' ', 'T')).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—';

const STATUS: Record<string, [string, string]> = {
  draft: ['Draft', ''], pending_approval: ['Waiting approval', 'pending'], approved: ['Approved', 'approved'], rejected: ['Rejected', 'rejected'],
  ordered: ['Ordered', 'scheduled'], partial: ['Partly received', 'pending'], received: ['Received', 'done'], closed: ['Closed', ''], cancelled: ['Cancelled', ''],
  final: ['Final', 'done'], converted: ['Converted', 'done'], pending: ['Pending', 'pending'], packed: ['Packed', 'scheduled'], dispatched: ['Out for delivery', 'in_progress'],
  delivered: ['Delivered', 'done'], failed: ['Failed', 'rejected'], open: ['Open', 'pending'], in_progress: ['In progress', 'in_progress'], resolved: ['Resolved', 'done'],
  running: ['Running', 'in_progress'], completed: ['Completed', 'done'], paused: ['Paused', ''], synced: ['Synced', 'done'], waiting: ['Waiting', ''], skipped: ['Skipped', ''],
  credit: ['Udhari', 'pending'], cash: ['Cash', ''], upi: ['UPI', ''], bank: ['Bank', ''], card: ['Card', ''], cheque: ['Cheque', ''],
};
export function St({ s }: { s: string }) {
  const [label, cls] = STATUS[s] ?? [s, ''];
  return <Badge s={cls}>{label}</Badge>;
}

export function Tabs({ tabs, value, onChange }: { tabs: [string, ReactNode][]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="chips">
      {tabs.map(([k, l]) => <span key={k} className={`chip ${value === k ? 'on' : ''}`} onClick={() => onChange(k)}>{l}</span>)}
    </div>
  );
}

export function Kpi({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'green' }) {
  return (
    <div className="card kpi">
      <small>{label}</small><br /><b style={tone ? { color: `var(--${tone})` } : undefined}>{value}</b>{sub && <span>{sub}</span>}
    </div>
  );
}

/** Generic table: columns = [header, render] */
export function DataTable<T extends Record<string, any>>({ rows, cols, onRow, empty = 'Nothing here yet' }: {
  rows: T[] | null | undefined; cols: [ReactNode, (r: T) => ReactNode, ('r' | undefined)?][]; onRow?: (r: T) => void; empty?: string;
}) {
  if (!rows) return <div className="empty">Loading…</div>;
  if (!rows.length) return <div className="card"><Empty>{empty}</Empty></div>;
  return (
    <div className="card" style={{ padding: 6, overflowX: 'auto' }}>
      <table className="t">
        <thead><tr>{cols.map(([h, , a], i) => <th key={i} style={a === 'r' ? { textAlign: 'right' } : undefined}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id ?? i} className={onRow ? 'click' : ''} onClick={onRow ? () => onRow(r) : undefined}>
              {cols.map(([, f, a], j) => { const v = f(r); return <td key={j} className={typeof v === 'string' && /^[A-Z]{2,4}\/\d{2}-\d{2}\/\d{3,}$/.test(v) ? 'nw' : undefined} style={a === 'r' ? { textAlign: 'right', whiteSpace: 'nowrap' } : undefined}>{v}</td>; })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────── pickers ─────────
export function useList<T = any>(entity: string, q?: Record<string, unknown>) {
  return useApi<T[]>(`/erp/masters/${entity}`, q);
}

export function Select({ value, onChange, options, placeholder = '—', disabled }: {
  value: any; onChange: (v: string) => void; options: { id: any; name: string }[]; placeholder?: string; disabled?: boolean;
}) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">{placeholder}</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );
}

/** Searchable product box: type name / SKU / barcode, pick from list. */
export function ProductSearch({ products, onPick, autoFocus }: { products: any[]; onPick: (p: any) => void; autoFocus?: boolean }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return products.slice(0, 30);
    const exact = products.filter((p) => p.barcode && p.barcode.toLowerCase() === s);
    if (exact.length) return exact;
    return products.filter((p) => `${p.name} ${p.sku ?? ''} ${p.barcode ?? ''} ${p.category_name ?? ''}`.toLowerCase().includes(s)).slice(0, 30);
  }, [q, products]);
  const pick = (p: any) => { onPick(p); setQ(''); setOpen(false); };
  return (
    <div style={{ position: 'relative' }}>
      <input className="input" autoFocus={autoFocus} placeholder="Add item: type name, SKU or scan barcode…" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => { if (e.key === 'Enter' && hits[0]) { e.preventDefault(); pick(hits[0]); } }} style={{ width: '100%' }} />
      {open && hits.length > 0 && (
        <div className="pop-list">
          {hits.map((p) => (
            <div key={p.id} className="pop-item" onMouseDown={() => pick(p)}>
              <span>{p.name} <span className="muted">{p.sku ?? ''}</span></span>
              <span className="muted">{qty(p.stock)} {p.unit} in stock</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export type Line = { product_id: number; name: string; unit: string; qty: number | string; rate: number | string; gst_rate: number | string; discount_pct?: number | string; stock?: number; [k: string]: any };

export function lineTotals(lines: Line[], withDiscount = false) {
  let sub = 0, disc = 0, tax = 0;
  for (const l of lines) {
    const g = Number(l.qty || 0) * Number(l.rate || 0);
    const d = withDiscount ? (g * Number(l.discount_pct || 0)) / 100 : 0;
    sub += g; disc += d; tax += ((g - d) * Number(l.gst_rate || 0)) / 100;
  }
  return { sub, disc, tax, total: Math.round(sub - disc + tax) };
}

/** Editable item lines with qty / rate / GST (and discount for sales). */
export function ItemsEditor({ lines, setLines, products, withDiscount, priceKey = 'purchase_price', showStock }: {
  lines: Line[]; setLines: (l: Line[]) => void; products: any[]; withDiscount?: boolean; priceKey?: string; showStock?: boolean;
}) {
  const upd = (i: number, k: string, v: any) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const add = (p: any) => {
    const i = lines.findIndex((l) => l.product_id === p.id);
    if (i >= 0) return upd(i, 'qty', Number(lines[i].qty || 0) + 1);
    setLines([...lines, { product_id: p.id, name: p.name, unit: p.unit, qty: 1, rate: Number(p[priceKey] ?? 0), gst_rate: Number(p.gst_rate ?? 18), discount_pct: 0, stock: Number(p.stock ?? 0) }]);
  };
  const t = lineTotals(lines, withDiscount);
  return (
    <div className="card" style={{ padding: 10 }}>
      <ProductSearch products={products} onPick={add} />
      {lines.length > 0 && (
        <table className="t items" style={{ marginTop: 8 }}>
          <thead><tr><th>Item</th><th>Qty</th><th>Rate (excl. GST)</th>{withDiscount && <th>Disc %</th>}<th>GST %</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead>
          <tbody>
            {lines.map((l, i) => {
              const g = Number(l.qty || 0) * Number(l.rate || 0);
              const d = withDiscount ? (g * Number(l.discount_pct || 0)) / 100 : 0;
              const amt = (g - d) * (1 + Number(l.gst_rate || 0) / 100);
              const short = showStock && l.stock !== undefined && Number(l.qty) > Number(l.stock);
              return (
                <tr key={i}>
                  <td>{l.name}{showStock && <div className="muted" style={short ? { color: 'var(--red)' } : undefined}>{qty(l.stock)} {l.unit} in stock (all godowns)</div>}</td>
                  <td><input type="number" min="0" step="any" value={l.qty} onChange={(e) => upd(i, 'qty', e.target.value)} style={{ width: 80 }} /> <span className="muted">{l.unit}</span></td>
                  <td><input type="number" min="0" step="any" value={l.rate} onChange={(e) => upd(i, 'rate', e.target.value)} style={{ width: 100 }} /></td>
                  {withDiscount && <td><input type="number" min="0" max="100" step="any" value={l.discount_pct ?? 0} onChange={(e) => upd(i, 'discount_pct', e.target.value)} style={{ width: 64 }} /></td>}
                  <td><input type="number" min="0" step="any" value={l.gst_rate} onChange={(e) => upd(i, 'gst_rate', e.target.value)} style={{ width: 60 }} /></td>
                  <td style={{ textAlign: 'right' }}>{rs(amt, 2)}</td>
                  <td><button className="link" onClick={() => setLines(lines.filter((_, j) => j !== i))}>Remove</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {lines.length > 0 && (
        <div className="totals">
          <span>Subtotal {rs(t.sub, 2)}</span>{withDiscount && t.disc > 0 && <span>Discount −{rs(t.disc, 2)}</span>}<span>GST {rs(t.tax, 2)}</span><b>Total {rs(t.total)}</b>
        </div>
      )}
    </div>
  );
}

export const linesBody = (lines: Line[]) =>
  lines.map((l) => ({ product_id: l.product_id, qty: Number(l.qty), rate: Number(l.rate), gst_rate: Number(l.gst_rate), discount_pct: Number(l.discount_pct ?? 0), po_item_id: l.po_item_id, damaged_qty: l.damaged_qty, ref_item_id: l.ref_item_id, restock: l.restock }));

// ───────── approvals + history panels ─────────
export function ApprovalTrail({ rows }: { rows?: any[] }) {
  if (!rows?.length) return null;
  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h3>Approvals</h3>
      {rows.map((a) => (
        <div key={a.id} className="list-item between">
          <span>Level {a.level} · {a.approver_role === 'owner' ? 'Boss' : 'Manager'}{a.remarks ? <span className="muted"> · {a.remarks}</span> : null}
            {a.voice_id ? <audio controls preload="none" style={{ height: 30, verticalAlign: 'middle', marginLeft: 6 }} src={`/api/files/${a.voice_id}?token=${localStorage.getItem('wt_token')}`} /> : null}</span>
          <span><St s={a.status} /> {a.acted_by_name && <span className="muted">{a.acted_by_name} · {dt(a.acted_at)}</span>}</span>
        </div>
      ))}
    </div>
  );
}

export function History({ rows }: { rows?: any[] }) {
  if (!rows?.length) return null;
  return (
    <details className="card" style={{ marginTop: 12 }}>
      <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Activity &amp; change log ({rows.length})</summary>
      {rows.map((h) => (
        <div key={h.id} className="list-item between">
          <span>{h.action.replace(/_/g, ' ')} {h.data && h.data !== '[]' && <span className="muted" style={{ fontSize: 11 }}>{h.data.slice(0, 140)}</span>}</span>
          <span className="muted">{h.user_name ?? 'System'} · {dt(h.created_at)}</span>
        </div>
      ))}
    </details>
  );
}

export function Files({ files }: { files?: any[] }) {
  if (!files?.length) return null;
  const token = localStorage.getItem('wt_token');
  return (
    <div className="row" style={{ flexWrap: 'wrap', marginTop: 10 }}>
      {files.map((f) => <a key={f.id} className="chip" target="_blank" rel="noreferrer" href={`/api/files/${f.id}?token=${token}`}><Icon name="clip" size={12} /> {f.file_name}</a>)}
    </div>
  );
}

/** Small confirm-with-reason modal */
export function ReasonModal({ title, onClose, onOk, need = true }: { title: string; onClose: () => void; onOk: (reason: string) => Promise<void> | void; need?: boolean }) {
  const [r, setR] = useState('');
  const [err, setErr] = useState<string | null>(null);
  return (
    <Drawer title={title} onClose={onClose} modal>
      <ErrorBox msg={err} />
      <textarea className="input" rows={3} value={r} onChange={(e) => setR(e.target.value)} placeholder="Reason" style={{ width: '100%' }} />
      <button className="btn" style={{ marginTop: 10 }} disabled={need && !r.trim()} onClick={async () => { try { await onOk(r); onClose(); } catch (e) { setErr((e as Error).message); } }}>Confirm</button>
    </Drawer>
  );
}

/** Wraps an async action with error capture */
export function useAction() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { return await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return { err, setErr, busy, run };
}

export function NoAccess() {
  return <div className="card"><Empty>You don't have access to this section. Ask the boss to give your ERP role access.</Empty></div>;
}

/** Live list of products (with stock) used by item editors. */
export function useProducts() {
  const [list, setList] = useState<any[]>([]);
  useEffect(() => { api<any[]>('/erp/masters/products', { query: { limit: 2000 } }).then(setList).catch(() => setList([])); }, []);
  return list;
}

export function ReportTable({ rows }: { rows: any[] }) {
  if (!rows.length) return <div className="card"><Empty>No data for this period</Empty></div>;
  const keys = Object.keys(rows[0]);
  const isNum = (k: string) => rows.every((r) => r[k] === null || r[k] === '' || !isNaN(Number(r[k]))) && !/(_no|no|id|date|mobile|gstin|sku)$/i.test(k);
  const money = (k: string) => /(amount|total|subtotal|tax|paid|balance|value|price|sales|recovered|unpaid|taxable|gst|discount|profit|due|outstanding)/i.test(k);
  return (
    <div className="card" style={{ padding: 6, overflowX: 'auto' }}>
      <table className="t">
        <thead><tr>{keys.map((k) => <th key={k} style={isNum(k) ? { textAlign: 'right' } : undefined}>{k.replace(/_/g, ' ')}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{keys.map((k) => {
              const v = r[k];
              const isDate = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(v);
              const shown = isNum(k) && v !== null ? (money(k) ? rs(v, 2) : qty(v)) : isDate ? (v.length > 10 ? dt(v) : d8(v)) : (v ?? '—');
              return <td key={k} style={{ ...(isNum(k) ? { textAlign: 'right' } : {}), ...(isNum(k) || isDate || String(v ?? '').length <= 22 ? { whiteSpace: 'nowrap' } : {}) }}>{shown}</td>;
            })}</tr>
          ))}
        </tbody>
        {keys.some((k) => isNum(k) && money(k)) && (
          <tfoot><tr>{keys.map((k, i) => <td key={k} style={{ textAlign: 'right', fontWeight: 600 }}>{i === 0 ? 'Total' : isNum(k) && money(k) ? rs(rows.reduce((s, r) => s + Number(r[k] || 0), 0), 2) : ''}</td>)}</tr></tfoot>
        )}
      </table>
    </div>
  );
}

/** Approve / reject with a typed note and / or a voice note (voice alone is enough to reject). */
export function DecisionModal({ title, approve, onClose, onDone, url }: { title: string; approve: boolean; onClose: () => void; onDone: () => void; url: string }) {
  const [r, setR] = useState('');
  const rec = useRecorder();
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      fd.append('approve', approve ? '1' : '0'); fd.append('remarks', r); fd.append('note', r);
      if (rec.blob) { fd.append('voice_note', rec.blob); fd.append('voice_duration', String(rec.secs)); }
      await api(url, { body: fd }); onDone(); onClose();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Drawer title={title} onClose={onClose} modal>
      <ErrorBox msg={err} />
      <textarea className="input" rows={3} value={r} onChange={(e) => setR(e.target.value)} placeholder={approve ? 'Note (optional)' : 'Reason — write it or record a voice note'} style={{ width: '100%' }} />
      <div style={{ marginTop: 8 }}><VoiceNote rec={rec} label="Explain by voice" /></div>
      <button className={`btn ${approve ? 'ok' : 'danger'}`} disabled={busy || rec.recording || (!approve && !r.trim() && !rec.blob)} onClick={go}>{approve ? 'Approve' : 'Reject'}</button>
    </Drawer>
  );
}
