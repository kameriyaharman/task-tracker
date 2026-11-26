import { dmy, dmyt } from '../format';
import { useEffect, useState } from 'react';

const API = (import.meta.env.VITE_API_URL as string) || '/api';
const rs = (n: number) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 0 });
async function call(path: string, body?: any) {
  const r = await fetch(API + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Something went wrong');
  return j;
}

/** What a customer sees from the WhatsApp link: proforma (Approve / ask for changes) or bill (UPI pay). No login. */
export function PublicDoc({ token }: { token: string }) {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { call(`/public/doc/${token}`).then(setD).catch((e) => setErr(e.message)); }, [token]);
  const decide = async (action: string) => {
    setBusy(true); setErr(null);
    try { setD(await call(`/public/doc/${token}`, { action, note })); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  if (err && !d) return <div className="pub"><div className="pub-card"><h2>Link not available</h2><p className="muted">{err}</p></div></div>;
  if (!d) return <div className="pub"><div className="pub-card">Loading…</div></div>;
  const b = d.business;
  return (
    <div className="pub">
      <div className="pub-card">
        <div className="pub-head">
          <div><h2>{b.display_name}</h2><div className="muted">{b.tagline}</div><div className="muted small">{[b.address, b.phone].filter(Boolean).join(' · ')}</div></div>
          <div className="r"><b>{d.kind.toUpperCase()}</b><div>{d.doc_no}</div><div className="muted">{dmy(d.date)}</div></div>
        </div>
        <div className="muted" style={{ margin: '10px 0' }}>For <b style={{ color: '#2b1a10' }}>{d.party_name}</b>{d.party_address ? ` · ${d.party_address}` : ''}</div>
        <table className="pub-t">
          <thead><tr><th>Item</th><th className="r">Qty</th><th className="r">Rate</th><th className="r">Amount</th></tr></thead>
          <tbody>
            {d.items.map((i: any, n: number) => (
              <tr key={n}><td>{i.name}{+i.discount_pct ? <div className="muted small">{+i.discount_pct}% off · GST {+i.gst_rate}%</div> : <div className="muted small">GST {+i.gst_rate}%</div>}</td>
                <td className="r">{+i.qty} {i.unit}</td><td className="r">{rs(i.rate)}</td><td className="r">{rs(i.amount)}</td></tr>
            ))}
            {d.charges.map((c: any, n: number) => <tr key={`c${n}`}><td colSpan={3}>{c.label}</td><td className="r">{rs(c.amount)}</td></tr>)}
          </tbody>
        </table>
        <div className="pub-tot">
          <span>Items {rs(d.subtotal - d.discount)}</span><span>GST {rs(d.tax)}</span>{d.charges_total > 0 && <span>Charges {rs(d.charges_total)}</span>}
          <b>Total {rs(d.total)}</b>
          {d.kind === 'Tax invoice' && <span>Paid {rs(d.paid)} · <b style={{ color: d.due > 0.5 ? '#c0392b' : '#1e8449' }}>Balance {rs(d.due)}</b></span>}
        </div>

        {d.delivery && <div className="pub-note">🚚 Delivery: <b>{d.delivery.status}</b>{d.delivery.delivered_at ? ` on ${dmyt(d.delivery.delivered_at)}` : ''}</div>}

        {d.can_approve && (
          <div className="pub-box">
            <p>{b.proforma_note}</p>
            {d.approval === 'changes' && <p className="muted">You asked: “{d.customer_note}”. We will update it.</p>}
            <button className="pub-btn ok" disabled={busy} onClick={() => decide('approve')}>✅ Approve — go ahead</button>
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Want a change? Write it here (item, quantity, rate…)" />
            <button className="pub-btn" disabled={busy || !note.trim()} onClick={() => decide('changes')}>✏️ Ask for changes</button>
          </div>
        )}
        {d.approval === 'approved' && d.kind !== 'Tax invoice' && <div className="pub-note ok">✅ You approved this on {dmyt(d.approved_at)}. Thank you!</div>}

        {d.upi && (
          <div className="pub-box">
            <a className="pub-btn ok" href={d.upi}>Pay {rs(d.due)} by UPI</a>
            <p className="muted small">Opens GPay / PhonePe / Paytm on your phone. UPI ID: <b>{b.upi_id}</b></p>
          </div>
        )}
        {d.kind === 'Tax invoice' && d.due > 0.5 && b.bank_name && <p className="muted small">Bank transfer: {b.account_holder || b.display_name} · {b.bank_name} · A/c {b.account_no} · IFSC {b.ifsc}</p>}
        {err && <p className="pub-err">{err}</p>}
        <details><summary className="muted small">Terms & conditions</summary><pre className="pub-terms">{d.terms}</pre></details>
        <div className="row" style={{ justifyContent: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button className="pub-btn ghost" onClick={() => window.print()}>🖨 Print / save PDF</button>
          {b.whatsapp || b.phone ? <a className="pub-btn ghost" href={`https://wa.me/91${String(b.whatsapp || b.phone).replace(/\D/g, '').slice(-10)}`}>💬 WhatsApp us</a> : null}
        </div>
      </div>
    </div>
  );
}

/** Digital visiting card of the business — shared on WhatsApp in one tap. */
export function PublicCard({ token }: { token: string }) {
  const [c, setC] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { call(`/public/card/${token}`).then(setC).catch((e) => setErr(e.message)); }, [token]);
  if (err) return <div className="pub"><div className="pub-card"><h2>Card not found</h2></div></div>;
  if (!c) return <div className="pub"><div className="pub-card">Loading…</div></div>;
  const wa = String(c.whatsapp || c.phone || '').replace(/\D/g, '').slice(-10);
  return (
    <div className="pub">
      <div className="pub-card vcard">
        <div className="vc-top"><img src="/favicon.svg" alt="" onError={(e) => ((e.target as HTMLImageElement).style.display = 'none')} /><h1>{c.display_name}</h1><div>{c.tagline}</div></div>
        <div className="vc-actions">
          {c.phone && <a href={`tel:${c.phone}`}>📞<span>Call</span></a>}
          {wa && <a href={`https://wa.me/91${wa}`}>💬<span>WhatsApp</span></a>}
          {c.map_url && <a href={c.map_url}>📍<span>Location</span></a>}
          {c.email && <a href={`mailto:${c.email}`}>✉️<span>Email</span></a>}
          {c.website && <a href={c.website}>🌐<span>Website</span></a>}
        </div>
        {c.address && <div className="vc-row"><b>Address</b><span>{c.address}</span></div>}
        {c.hours && <div className="vc-row"><b>Timings</b><span>{c.hours}</span></div>}
        {(c.products_line || c.categories?.length > 0) && <div className="vc-row"><b>We deal in</b><span>{c.products_line || c.categories.join(' · ')}</span></div>}
        {(c.brands_line || c.brands?.length > 0) && <div className="vc-row"><b>Brands</b><span>{c.brands_line || c.brands.join(' · ')}</span></div>}
        {c.gstin && <div className="vc-row"><b>GSTIN</b><span>{c.gstin}</span></div>}
        {(c.bank_name || c.upi_id) && (
          <div className="vc-row"><b>Payment</b><span>
            {c.bank_name && <>{c.account_holder || c.display_name}<br />{c.bank_name} · A/c {c.account_no}<br />IFSC {c.ifsc}<br /></>}
            {c.upi_id && <>UPI: <b>{c.upi_id}</b></>}
          </span></div>
        )}
        <button className="pub-btn ok" style={{ marginTop: 14 }} onClick={() => (navigator.share ? navigator.share({ title: c.display_name, url: location.href }) : navigator.clipboard.writeText(location.href))}>Share this card</button>
      </div>
    </div>
  );
}
