import { useEffect, useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { ErrorBox, Field, Icon, Loading } from '../ui';
import { useAction } from './common';

const FIELDS: [string, string, string?][] = [
  ['display_name', 'Business name'], ['tagline', 'Tagline', 'Construction Solution · Hardware · Paint · Electrical'], ['phone', 'Phone'], ['whatsapp', 'WhatsApp no.'],
  ['email', 'Email'], ['website', 'Website'], ['gstin', 'GSTIN'], ['pan', 'PAN'], ['hours', 'Timings', 'Mon–Sat 9 AM – 8 PM'],
  ['map_url', 'Google Maps link', 'https://maps.app.goo.gl/…'], ['bank_name', 'Bank name'], ['account_holder', 'Account holder'], ['account_no', 'Account no.'],
  ['ifsc', 'IFSC'], ['upi_id', 'UPI ID (customers pay here)', 'keshav@okhdfc'],
];

/** Business profile — printed on bills, used in WhatsApp messages / UPI links and the digital visiting card. */
export default function Business() {
  const { data, reload } = useApi<any>('/erp/business-profile');
  const [f, setF] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const a = useAction();
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <><Topbar title="Business profile & digital card" /><Loading /></>;
  const cardUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, '')}/card/${f.card_token}`;
  const waText = `${f.display_name}${f.tagline ? `\n${f.tagline}` : ''}\n${f.address ?? ''}\n📞 ${f.phone ?? ''}\nView our card (location, bank / UPI, products): ${cardUrl}`;
  return (
    <>
      <Topbar title="Business profile & digital card" action={<div className="row">
        <a className="btn ghost" href={cardUrl} target="_blank" rel="noreferrer">👁 See card</a>
        <a className="btn wa" href={`https://wa.me/?text=${encodeURIComponent(waText)}`} target="_blank" rel="noreferrer"><Icon name="whatsapp" /> Send card on WhatsApp</a>
      </div>} />
      <ErrorBox msg={a.err} />
      <div className="goal-help">This information goes on every bill / quotation, in WhatsApp messages to customers, on the UPI "Pay now" button and on the <b>digital visiting card</b> (<a href={cardUrl} target="_blank" rel="noreferrer">{cardUrl}</a>) that staff can send to anyone who asks for your details.</div>
      <div className="card">
        <div className="grid g3">
          {FIELDS.map(([k, l, ph]) => <Field key={k} label={l}><input value={f[k] ?? ''} placeholder={ph ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
        </div>
        <Field label="Address"><input value={f.address ?? ''} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <div className="grid g2">
          <Field label="We deal in (shown on card)"><input value={f.products_line ?? ''} placeholder="Cement, TMT, pipes & fittings, paints, switches, sanitary…" onChange={(e) => setF({ ...f, products_line: e.target.value })} /></Field>
          <Field label="Brands (shown on card)"><input value={f.brands_line ?? ''} placeholder="UltraTech, ACC, Asian Paints, Anchor, Ashirvad…" onChange={(e) => setF({ ...f, brands_line: e.target.value })} /></Field>
        </div>
        <Field label="Terms & conditions (printed on bills, can be changed per bill)"><textarea className="input" rows={5} style={{ width: '100%' }} value={f.terms ?? ''} onChange={(e) => setF({ ...f, terms: e.target.value })} /></Field>
        <Field label="Message on proforma sent for customer approval"><input value={f.proforma_note ?? ''} onChange={(e) => setF({ ...f, proforma_note: e.target.value })} /></Field>
        <div className="row">
          <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { const { card_token, ...body } = f; await api('/erp/business-profile', { method: 'PATCH', body }); reload(); setMsg('Saved'); setTimeout(() => setMsg(null), 1500); })}>Save</button>
          {msg && <span className="ok-text">✓ {msg}</span>}
        </div>
      </div>
    </>
  );
}
