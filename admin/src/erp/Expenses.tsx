import { DateInput } from '../dateinput';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { useRecorder, VoiceNote } from '../voice';
import { ApprovalTrail, DataTable, History, Kpi, Select, St, Tabs, d8, rs, useAction, useMeta } from './common';

const STATUS: Record<string, string> = { pending_verification: 'With accounts', pending_approval: 'With boss', approved: 'Approved', rejected: 'Rejected' };
const fileUrl = (id: number) => `/api/files/${id}?token=${localStorage.getItem('wt_token')}`;

/** Expenses like Zoho Expense: bills & mileage → accounts verify → boss approve; advances, trips, vehicles. */
export function Expenses() {
  const { meta } = useMeta();
  const { me } = useAuth();
  const [tab, setTab] = useState('all');
  const list = useApi<any>(['all', 'verify', 'mine', 'mileage'].includes(tab) ? '/erp/expenses' : null,
    { status: tab === 'verify' ? 'pending_verification' : '', kind: tab === 'mileage' ? 'mileage' : '', user_id: tab === 'mine' ? me?.id : '' });
  const [form, setForm] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const items: any[] = list.data?.items ?? [];
  const sum = (st: string[]) => items.filter((e) => st.includes(e.status)).reduce((t, e) => t + Number(e.amount), 0);
  return (
    <>
      <Topbar title="Expenses" action={<div className="row">
        <button className="btn ghost" onClick={() => setForm('mileage')}>🛵 Mileage (km)</button>
        <button className="btn" onClick={() => setForm('expense')}><Icon name="plus" /> Add expense</button>
      </div>} />
      <div className="goal-help">Flow: staff add expense with bill photo (or km for mileage) → <b>Accounts verifies</b> the bill is genuine → <b>Boss approves</b> → counted. Money given in advance and trips are tracked below.</div>
      <Tabs value={tab} onChange={setTab} tabs={[['all', 'All'], ...(list.data?.can_verify ? [['verify', `To verify (${list.data?.to_verify ?? 0})`]] as [string, string][] : []), ['mine', 'Mine'], ['mileage', 'Mileage'], ['advances', 'Advances & balances'], ['trips', 'Trips'], ['setup', 'Vehicles & categories']]} />
      {['all', 'verify', 'mine', 'mileage'].includes(tab) && (
        <>
          <div className="grid g4" style={{ marginBottom: 12 }}>
            <Kpi label="With accounts" value={rs(sum(['pending_verification']))} /><Kpi label="With boss" value={rs(sum(['pending_approval']))} />
            <Kpi label="Approved" value={rs(sum(['approved']))} tone="green" /><Kpi label="Rejected" value={rs(sum(['rejected']))} />
          </div>
          <DataTable rows={list.data ? items : null} onRow={(r) => setOpen(r.id)} cols={[
            ['No.', (r) => r.exp_no], ['Date', (r) => d8(r.exp_date)],
            ['What', (r) => <>{r.kind === 'mileage' ? `🛵 ${r.km} km × ₹${Number(r.rate_per_km)} (${r.vehicle_name ?? ''})` : r.category}<div className="muted">{[r.merchant, r.paid_to, r.trip_no ? `Trip ${r.trip_no} · ${r.destination}` : null].filter(Boolean).join(' · ')}</div></>],
            ['By', (r) => r.created_by_name], ['Bill', (r) => (Number(r.bills) ? `📎 ${r.bills}` : '—')],
            ['Claim', (r) => (+r.reimburse ? 'Pay back to staff' : 'Paid by shop')],
            ['Amount', (r) => rs(r.amount, 2), 'r'], ['Status', (r) => <><St s={r.status} /><div className="muted">{STATUS[r.status]}</div></>],
          ]} />
        </>
      )}
      {tab === 'advances' && <Advances canEdit={!!list.data?.can_verify || meta?.role !== 'employee'} />}
      {tab === 'trips' && <Trips />}
      {tab === 'setup' && <Setup />}
      {form && <ExpenseForm kind={form} onClose={() => setForm(null)} onSaved={() => { setForm(null); list.reload(); }} />}
      {open && <ExpenseDrawer id={open} onClose={() => setOpen(null)} onChanged={list.reload} />}
    </>
  );
}

function ExpenseForm({ kind, onClose, onSaved }: { kind: string; onClose: () => void; onSaved: () => void }) {
  const { meta } = useMeta();
  const cats = useApi<any>('/erp/expenses', { status: 'none' });
  const vehicles = useApi<any[]>(kind === 'mileage' ? '/erp/vehicles' : null);
  const trips = useApi<any[]>('/erp/trips');
  const vendors = useApi<any[]>(kind === 'expense' ? '/erp/masters/vendors' : null);
  const [f, setF] = useState<any>({ exp_date: new Date().toISOString().slice(0, 10), category: '', amount: '', merchant: '', invoice_no: '', mode: 'cash', paid_to_type: 'other', paid_to: '', paid_to_id: '', reimburse: true, trip_id: '', notes: '', vehicle_id: '', odo_start: '', odo_end: '', km: '' });
  const [files, setFiles] = useState<File[]>([]);
  const [newCat, setNewCat] = useState<string | null>(null);
  const [gps, setGps] = useState<number | null>(null);
  const a = useAction();
  const veh = (vehicles.data ?? []).find((v) => String(v.id) === String(f.vehicle_id));
  const km = f.odo_start && f.odo_end ? Number(f.odo_end) - Number(f.odo_start) : Number(f.km) || 0;
  const save = () => a.run(async () => {
    const fd = new FormData();
    fd.append('kind', kind);
    Object.entries(f).forEach(([k, v]) => v !== '' && v != null && fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)));
    if (gps !== null) fd.append('gps_km', String(gps));
    files.forEach((x) => fd.append('bills[]', x));
    const r = await api<any>('/erp/expenses', { body: fd });
    if (r.status === 'pending_verification') alert('Sent to accounts for verification.');
    onSaved();
  });
  return (
    <Drawer title={kind === 'mileage' ? 'Mileage claim (km)' : 'New expense'} onClose={onClose} wide>
      <ErrorBox msg={a.err} />
      <div className="grid g3">
        <Field label="Date"><DateInput max={new Date().toISOString().slice(0, 10)} value={f.exp_date} onChange={(e) => setF({ ...f, exp_date: e.target.value })} /></Field>
        {kind === 'mileage' ? (
          <>
            <Field label="Vehicle *"><select value={f.vehicle_id} onChange={(e) => setF({ ...f, vehicle_id: e.target.value })}><option value="">Choose</option>{(vehicles.data ?? []).filter((v) => +v.is_active).map((v) => <option key={v.id} value={v.id}>{v.name} {v.reg_no ? `· ${v.reg_no}` : ''} · ₹{Number(v.rate_per_km)}/km</option>)}</select></Field>
            <Field label="km from GPS (app tracking)">
              <div className="row"><b>{gps ?? '—'}</b><button type="button" className="btn ghost sm" onClick={() => a.run(async () => setGps((await api<any>('/erp/mileage/gps', { query: { date: f.exp_date } })).km))}>Get</button></div>
            </Field>
            <Field label="Meter reading — start"><input type="number" value={f.odo_start} onChange={(e) => setF({ ...f, odo_start: e.target.value })} /></Field>
            <Field label="Meter reading — end"><input type="number" value={f.odo_end} onChange={(e) => setF({ ...f, odo_end: e.target.value })} /></Field>
            <Field label="…or km travelled"><input type="number" value={f.km} disabled={!!(f.odo_start && f.odo_end)} onChange={(e) => setF({ ...f, km: e.target.value })} /></Field>
          </>
        ) : (
          <>
            <Field label="Category *">
              {newCat === null ? (
                <select value={f.category} onChange={(e) => (e.target.value === '__add' ? setNewCat('') : setF({ ...f, category: e.target.value }))}>
                  <option value="">Choose</option>{(cats.data?.categories ?? []).map((c: string) => <option key={c}>{c}</option>)}<option value="__add">＋ Add category…</option>
                </select>
              ) : (
                <div className="row" style={{ gap: 4 }}><input className="input" autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="e.g. Toll tax" />
                  <button type="button" className="btn sm" disabled={!newCat.trim()} onClick={() => a.run(async () => { await api('/erp/expense-categories', { body: { name: newCat } }); await cats.reload(); setF({ ...f, category: newCat.trim() }); setNewCat(null); })}>Add</button></div>
              )}
            </Field>
            <Field label="Amount (₹) *"><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Merchant / shop"><input value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} placeholder="Indian Oil, Hotel Shree…" /></Field>
            <Field label="Bill / invoice no."><input value={f.invoice_no} onChange={(e) => setF({ ...f, invoice_no: e.target.value })} /></Field>
            <Field label="Paid to">
              <select value={f.paid_to_type} onChange={(e) => setF({ ...f, paid_to_type: e.target.value, paid_to_id: '', paid_to: '' })}><option value="other">Someone else (write name)</option><option value="employee">An employee</option><option value="vendor">A vendor / party</option></select>
            </Field>
            <Field label={f.paid_to_type === 'other' ? 'Name' : f.paid_to_type === 'employee' ? 'Employee' : 'Vendor'}>
              {f.paid_to_type === 'other' ? <input value={f.paid_to} onChange={(e) => setF({ ...f, paid_to: e.target.value })} placeholder="Labour, porter, auto…" />
                : <Select value={f.paid_to_id} onChange={(v) => setF({ ...f, paid_to_id: v })} options={f.paid_to_type === 'employee' ? meta?.users ?? [] : (vendors.data ?? []).map((v) => ({ id: v.id, name: v.business_name || v.name }))} />}
            </Field>
            <Field label="Mode"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank</option></select></Field>
          </>
        )}
        <Field label="Against trip (optional)"><select value={f.trip_id} onChange={(e) => setF({ ...f, trip_id: e.target.value })}><option value="">—</option>{(trips.data ?? []).filter((t) => t.status === 'approved').map((t) => <option key={t.id} value={t.id}>{t.trip_no} · {t.destination} · {t.user_name}</option>)}</select></Field>
      </div>
      {kind === 'mileage' && veh && km > 0 && <div className="lock-note ok">{km} km × ₹{Number(veh.rate_per_km)} = <b>{rs(km * Number(veh.rate_per_km), 2)}</b>{gps !== null && Math.abs(gps - km) > Math.max(5, km * 0.25) ? ` · ⚠ GPS shows ${gps} km — accounts will check` : ''}</div>}
      {kind === 'expense' && <label className="switch-row"><input type="checkbox" checked={f.reimburse} onChange={(e) => setF({ ...f, reimburse: e.target.checked })} /><span><b>Claim reimbursement</b> — I paid from my pocket / advance (uncheck if the shop paid directly)</span></label>}
      <div className="field"><span>{kind === 'mileage' ? 'Meter photos (start / end)' : 'Bill / receipt photo (needed above ₹200)'}</span>
        <div className="attach-list">
          {files.map((x, i) => <div key={i} className="attach-chip">{x.type.startsWith('image/') ? <img src={URL.createObjectURL(x)} alt="" /> : <span>📄</span>}<button className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>)}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📷 Add photo<input type="file" hidden multiple accept="image/*,application/pdf" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} /></label>
        </div>
      </div>
      <Field label="Description"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder={kind === 'mileage' ? 'Delivery to Sector 32, Dharuhera site' : ''} /></Field>
      <button className="btn" disabled={a.busy || (kind === 'mileage' ? !f.vehicle_id || km <= 0 : !f.category || !(Number(f.amount) > 0))} onClick={save}>Save & send to accounts</button>
    </Drawer>
  );
}

function ExpenseDrawer({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data: e, reload } = useApi<any>(`/erp/expenses/${id}`);
  const list = useApi<any>('/erp/expenses', { status: 'none' });
  const [note, setNote] = useState('');
  const rec = useRecorder();
  const a = useAction();
  if (!e) return null;
  const verify = (ok: boolean) => a.run(async () => {
    const fd = new FormData(); fd.append('ok', ok ? '1' : '0'); fd.append('note', note);
    if (rec.blob) { fd.append('voice_note', rec.blob); fd.append('voice_duration', String(rec.secs)); }
    await api(`/erp/expenses/${id}/verify`, { body: fd }); reload(); onChanged();
  });
  return (
    <Drawer title={`${e.exp_no} · ${rs(e.amount, 2)}`} onClose={onClose}>
      <ErrorBox msg={a.err} />
      <div className="between"><b>{e.kind === 'mileage' ? `🛵 Mileage — ${e.km} km × ₹${Number(e.rate_per_km)}` : e.category}</b><St s={e.status} /></div>
      <div className="muted">{d8(e.exp_date)} · by {e.created_by_name} · {+e.reimburse ? 'pay back to staff' : 'paid by shop'}{e.trip_no ? ` · trip ${e.trip_no} (${e.destination})` : ''}</div>
      {e.kind === 'mileage' && <div className="muted">{e.vehicle_name}{e.odo_start ? ` · meter ${e.odo_start} → ${e.odo_end}` : ''}{e.gps_km !== null ? ` · GPS ${e.gps_km} km` : ''}</div>}
      {(e.merchant || e.paid_to || e.invoice_no) && <div className="muted">{[e.merchant, e.paid_to && `paid to ${e.paid_to}`, e.invoice_no && `bill ${e.invoice_no}`].filter(Boolean).join(' · ')}</div>}
      {e.notes && <p>{e.notes}</p>}
      <div className="attach-list" style={{ margin: '10px 0' }}>
        {e.files.map((f: any) => f.kind === 'voice' ? <div key={f.id} className="attach-chip voice">🎤<audio controls preload="none" src={fileUrl(f.id)} /></div>
          : <a key={f.id} className="attach-chip" href={fileUrl(f.id)} target="_blank" rel="noreferrer">{(f.mime ?? '').startsWith('image') ? <img src={fileUrl(f.id)} alt="" /> : '📄'} {f.file_name.slice(0, 16)}</a>)}
        {!e.files.length && <span className="muted">No bill attached</span>}
      </div>
      {e.verified_by_name && <div className="lock-note ok">✔ Verified by {e.verified_by_name}{e.verify_note ? ` — ${e.verify_note}` : ''}</div>}
      {e.status === 'pending_verification' && list.data?.can_verify && (
        <div className="card complete-box">
          <h3>Verify (accounts)</h3>
          <p className="muted" style={{ marginTop: 0 }}>Check the bill is original (not made up), amount and date match, taxi / hotel was real.</p>
          <input className="input" style={{ width: '100%', marginBottom: 8 }} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder="Note (needed if not accepting)" />
          <VoiceNote rec={rec} label="Explain by voice" />
          <div className="row"><button className="btn ok" disabled={a.busy} onClick={() => verify(true)}>✔ Bill is genuine — send to boss</button><button className="btn danger" disabled={a.busy || (!note.trim() && !rec.blob)} onClick={() => verify(false)}>Not accepted</button></div>
        </div>
      )}
      <ApprovalTrail rows={e.approvals} /><History rows={e.history} />
    </Drawer>
  );
}

function Advances({ canEdit }: { canEdit: boolean }) {
  const { meta } = useMeta();
  const d = useApi<any>('/erp/advances');
  const [f, setF] = useState<any>(null);
  const a = useAction();
  return (
    <>
      <ErrorBox msg={a.err} />
      <div className="goal-help">Give an advance (e.g. ₹1,000 for petrol / small purchases) → staff add expenses with bills → their balance goes down. <b>Positive</b> = they still hold shop money; <b>negative</b> = shop has to pay them back (then record a settlement).</div>
      {canEdit && <div className="row" style={{ marginBottom: 10 }}><button className="btn" onClick={() => setF({ type: 'advance', user_id: '', amount: '', mode: 'cash', notes: '' })}>＋ Give advance</button><button className="btn ghost" onClick={() => setF({ type: 'settlement', user_id: '', amount: '', mode: 'cash', notes: '' })}>Pay back to staff</button><button className="btn ghost" onClick={() => setF({ type: 'returned', user_id: '', amount: '', mode: 'cash', notes: '' })}>Staff returned cash</button></div>}
      <div className="grid g3" style={{ marginBottom: 12 }}>
        {(d.data?.wallets ?? []).map((w: any) => (
          <div key={w.user_id} className="card">
            <div className="between"><b>{w.name}</b><span style={{ color: w.balance < -0.5 ? 'var(--red)' : w.balance > 0.5 ? 'var(--amber)' : 'var(--green)', fontWeight: 600 }}>{w.label}</span></div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Advances {rs(w.advances)} · approved claims {rs(w.claims)} · waiting {rs(w.pending_claims)} · paid back {rs(w.settled)}</div>
          </div>
        ))}
      </div>
      <DataTable rows={d.data?.items} cols={[
        ['No.', (r) => r.adv_no], ['Date', (r) => d8(r.adv_date)], ['Person', (r) => r.user_name],
        ['Type', (r) => ({ advance: 'Advance given', settlement: 'Paid back to staff', returned: 'Returned by staff' } as any)[r.type]], ['Mode', (r) => r.mode],
        ['Amount', (r) => rs(r.amount, 2), 'r'], ['Note', (r) => [r.trip_no && `Trip ${r.trip_no}`, r.notes].filter(Boolean).join(' · ')], ['By', (r) => r.created_by_name],
      ]} />
      {f && (
        <Drawer title={({ advance: 'Give advance', settlement: 'Pay back to staff', returned: 'Staff returned cash' } as any)[f.type]} onClose={() => setF(null)} modal>
          <Field label="Person"><Select value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={meta?.users ?? []} /></Field>
          <div className="grid g2">
            <Field label="Amount (₹)"><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
            <Field label="Mode"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank</option></select></Field>
          </div>
          <Field label="Note"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          <button className="btn" disabled={!f.user_id || !(Number(f.amount) > 0) || a.busy} onClick={() => a.run(async () => { await api('/erp/advances', { body: f }); setF(null); d.reload(); })}>Save</button>
        </Drawer>
      )}
    </>
  );
}

function Trips() {
  const { meta } = useMeta();
  const d = useApi<any[]>('/erp/trips');
  const [f, setF] = useState<any>(null);
  const a = useAction();
  const total = f ? ['travel', 'hotel', 'food', 'local', 'other'].reduce((t, k) => t + (Number(f.budget[k]) || 0), 0) : 0;
  return (
    <>
      <ErrorBox msg={a.err} />
      <div className="goal-help">Before going out of station (e.g. Jaipur), create a <b>trip</b> with the expected budget — the boss approves it first. During the trip, add hotel / food / travel expenses with bills <b>against the trip</b>.</div>
      <button className="btn" style={{ marginBottom: 10 }} onClick={() => setF({ user_id: '', purpose: '', destination: '', from_date: '', to_date: '', budget: { travel: '', hotel: '', food: '', local: '', other: '' }, notes: '' })}>＋ Plan a trip</button>
      <DataTable rows={d.data} cols={[
        ['Trip', (r) => <>{r.trip_no} · <b>{r.destination}</b><div className="muted">{r.purpose}</div></>], ['Person', (r) => r.user_name], ['Dates', (r) => `${d8(r.from_date)} – ${d8(r.to_date)}`],
        ['Budget', (r) => rs(r.budget_total), 'r'], ['Spent', (r) => <b style={{ color: Number(r.spent) > Number(r.budget_total) ? 'var(--red)' : undefined }}>{rs(r.spent)}</b>, 'r'],
        ['Advance', (r) => rs(r.advance), 'r'], ['Status', (r) => <St s={r.status} />],
        ['', (r) => (r.status === 'approved' ? <button className="link" onClick={() => a.run(async () => { await api(`/erp/trips/${r.id}/complete`, { body: {} }); d.reload(); })}>Close trip</button> : null)],
      ]} />
      {f && (
        <Drawer title="Plan a trip" onClose={() => setF(null)}>
          <Field label="Who is going"><Select value={f.user_id} onChange={(v) => setF({ ...f, user_id: v })} options={meta?.users ?? []} placeholder="Me" /></Field>
          <Field label="Where"><input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} placeholder="Jaipur" /></Field>
          <Field label="Purpose"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="Meet tile company / collect payment" /></Field>
          <div className="grid g2">
            <Field label="From"><DateInput value={f.from_date} onChange={(e) => setF({ ...f, from_date: e.target.value })} /></Field>
            <Field label="To"><DateInput value={f.to_date} onChange={(e) => setF({ ...f, to_date: e.target.value })} /></Field>
            {[['travel', 'Travel (bus / train / fuel)'], ['hotel', 'Hotel / stay'], ['food', 'Food'], ['local', 'Local auto / taxi'], ['other', 'Other']].map(([k, l]) => (
              <Field key={k} label={`${l} ₹`}><input type="number" value={f.budget[k]} onChange={(e) => setF({ ...f, budget: { ...f.budget, [k]: e.target.value } })} /></Field>
            ))}
          </div>
          <p>Total budget <b>{rs(total)}</b></p>
          <button className="btn" disabled={!f.destination || !f.purpose || !f.from_date || !f.to_date || total <= 0 || a.busy} onClick={() => a.run(async () => { await api('/erp/trips', { body: { ...f, user_id: f.user_id || undefined } }); setF(null); d.reload(); })}>Send for approval</button>
        </Drawer>
      )}
    </>
  );
}

function Setup() {
  const { meta } = useMeta();
  const v = useApi<any[]>('/erp/vehicles');
  const cats = useApi<any>('/erp/expenses', { status: 'none' });
  const [nv, setNv] = useState<any>({ name: '', type: 'bike', reg_no: '', rate_per_km: 3, user_id: '' });
  const [nc, setNc] = useState('');
  const a = useAction();
  return (
    <div className="grid g2">
      <div className="card">
        <ErrorBox msg={a.err} />
        <h3>Vehicles & rate per km</h3>
        {(v.data ?? []).map((x) => (
          <div key={x.id} className="list-item between">
            <span>{x.name} <span className="muted">· {x.type}{x.reg_no ? ` · ${x.reg_no}` : ''}{x.user_name ? ` · ${x.user_name}` : ''}</span></span>
            <span className="row">₹<input className="input" type="number" style={{ width: 70 }} defaultValue={Number(x.rate_per_km)} onBlur={(e) => Number(e.target.value) !== Number(x.rate_per_km) && a.run(async () => { await api(`/erp/vehicles/${x.id}`, { method: 'PATCH', body: { rate_per_km: e.target.value } }); v.reload(); })} />/km</span>
          </div>
        ))}
        <div className="grid g3" style={{ marginTop: 10 }}>
          <input className="input" value={nv.name} onChange={(e) => setNv({ ...nv, name: e.target.value })} placeholder="Deepak's bike" />
          <select className="input" value={nv.type} onChange={(e) => setNv({ ...nv, type: e.target.value })}>{['bike', 'scooter', 'car', 'tempo', 'other'].map((t) => <option key={t}>{t}</option>)}</select>
          <input className="input" value={nv.reg_no} onChange={(e) => setNv({ ...nv, reg_no: e.target.value })} placeholder="HR36 AB 1234" />
          <input className="input" type="number" value={nv.rate_per_km} onChange={(e) => setNv({ ...nv, rate_per_km: e.target.value })} placeholder="₹ per km" />
          <Select value={nv.user_id} onChange={(x) => setNv({ ...nv, user_id: x })} options={meta?.users ?? []} placeholder="Used by" />
          <button className="btn sm" disabled={!nv.name} onClick={() => a.run(async () => { await api('/erp/vehicles', { body: nv }); setNv({ name: '', type: 'bike', reg_no: '', rate_per_km: 3, user_id: '' }); v.reload(); })}>Add vehicle</button>
        </div>
      </div>
      <div className="card">
        <h3>Expense categories</h3>
        <div className="chips">{(cats.data?.categories ?? []).map((c: string) => <span key={c} className="chip">{c}</span>)}</div>
        <div className="row"><input className="input" value={nc} onChange={(e) => setNc(e.target.value)} placeholder="New category" /><button className="btn sm" disabled={!nc.trim()} onClick={() => a.run(async () => { await api('/erp/expense-categories', { body: { name: nc } }); setNc(''); cats.reload(); })}>Add</button></div>
      </div>
    </div>
  );
}
