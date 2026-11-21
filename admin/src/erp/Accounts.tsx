import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { DataTable, Kpi, NoAccess, Select, St, Tabs, can, d8, rs, useAction, useList, useMeta } from './common';

export function PaymentForm({ direction, partyId, amount, onClose, onSaved }: { direction: 'in' | 'out'; partyId?: any; amount?: number; onClose: () => void; onSaved: () => void }) {
  const parties = useList(direction === 'in' ? 'customers' : 'vendors');
  const [f, setF] = useState<any>({ party_id: partyId ?? '', amount: amount ? Math.round(amount) : '', mode: direction === 'in' ? 'cash' : 'bank', reference: '', pay_date: new Date().toISOString().slice(0, 10), notes: '' });
  const p = (parties.data ?? []).find((x) => String(x.id) === String(f.party_id));
  const a = useAction();
  return (
    <Drawer title={direction === 'in' ? 'Receive payment from customer' : 'Pay vendor'} onClose={onClose} modal>
      <ErrorBox msg={a.err} />
      <Field label={direction === 'in' ? 'Customer' : 'Vendor'}><Select value={f.party_id} onChange={(v) => setF({ ...f, party_id: v })} options={(parties.data ?? []).map((x) => ({ id: x.id, name: `${x.name} · due ${rs(x.outstanding)}` }))} placeholder="Choose" /></Field>
      {p && <p className="muted">Balance: <b>{rs(p.outstanding)}</b></p>}
      <div className="grid g2">
        <Field label="Amount (₹)"><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Mode"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank / NEFT</option><option value="cheque">Cheque</option><option value="card">Card</option></select></Field>
        <Field label="Reference (UTR / cheque no.)"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Date"><input type="date" value={f.pay_date} onChange={(e) => setF({ ...f, pay_date: e.target.value })} /></Field>
      </div>
      <Field label="Note"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {direction === 'out' && <p className="muted">Vendor payments go for approval before they are counted.</p>}
      <button className="btn" disabled={!f.party_id || !(Number(f.amount) > 0) || a.busy} onClick={() => a.run(async () => { await api('/erp/payments', { body: { ...f, direction } }); onSaved(); })}>Save</button>
    </Drawer>
  );
}

export default function Accounts() {
  const { meta } = useMeta();
  const [tab, setTab] = useState('receivable');
  const [pay, setPay] = useState<'in' | 'out' | null>(null);
  const [book, setBook] = useState({ book: 'cash', from: new Date().toISOString().slice(0, 8) + '01', to: new Date().toISOString().slice(0, 10) });
  const out = useApi<any[]>(['receivable', 'payable'].includes(tab) ? '/erp/outstanding' : null, { party: tab === 'payable' ? 'vendor' : 'customer' });
  const pays = useApi<any[]>(tab === 'payments' ? '/erp/payments' : null);
  const bk = useApi<any>(tab === 'book' ? '/erp/books' : null, book);
  if (meta && !can(meta, 'accounts') && !can(meta, 'recovery')) return <NoAccess />;
  const w = can(meta, 'accounts', true);
  const sum = (k: string) => (out.data ?? []).reduce((s, r) => s + Number(r[k] || 0), 0);
  return (
    <>
      <Topbar title="Accounts" action={<div className="row">
        {(w || can(meta, 'recovery', true)) && <button className="btn ok" onClick={() => setPay('in')}>Receive payment</button>}
        {w && <button className="btn" onClick={() => setPay('out')}>Pay vendor</button>}
      </div>} />
      <Tabs value={tab} onChange={setTab} tabs={[['receivable', 'Customers owe us'], ...(can(meta, 'accounts') ? [['payable', 'We owe vendors'], ['payments', 'Receipts & payments'], ['book', 'Cash / bank book']] as [string, string][] : [])]} />
      {['receivable', 'payable'].includes(tab) && (
        <>
          <div className="grid g4" style={{ marginBottom: 14 }}>
            <Kpi label="Total" value={rs(sum('outstanding'))} /><Kpi label="0–30 days" value={rs(sum('b0_30'))} />
            <Kpi label="31–90 days" value={rs(sum('b31_60') + sum('b61_90'))} /><Kpi label="90+ days" value={rs(sum('b90'))} tone={sum('b90') > 0 ? 'red' : undefined} />
          </div>
          <DataTable rows={out.data} cols={[
            ['Name', (r) => <>{r.name}<div className="muted">{r.mobile ?? ''}{r.recovery_user ? ` · ${r.recovery_user}` : ''}</div></>],
            ['Total due', (r) => <b>{rs(r.outstanding)}</b>, 'r'], ['0–30', (r) => rs(r.b0_30), 'r'], ['31–60', (r) => rs(r.b31_60), 'r'],
            ['61–90', (r) => rs(r.b61_90), 'r'], ['90+', (r) => <span style={{ color: Number(r.b90) ? 'var(--red)' : undefined }}>{rs(r.b90)}</span>, 'r'],
            ...(tab === 'receivable' ? [['Last follow-up', (r: any) => (r.last_followup ? <span className="muted">{r.last_followup.outcome.replace('_', ' ')}{r.last_followup.promise_date ? ` · ${d8(r.last_followup.promise_date)}` : ''}</span> : '—')] as [string, (r: any) => any]] : []),
          ]} />
        </>
      )}
      {tab === 'payments' && (
        <DataTable rows={pays.data} cols={[
          ['No.', (r) => r.pay_no], ['Date', (r) => d8(r.pay_date)], ['Type', (r) => (r.direction === 'in' ? 'Received' : 'Paid')], ['Party', (r) => r.party_name],
          ['Mode', (r) => <St s={r.mode} />], ['Ref', (r) => r.reference ?? (r.invoice_no ? `Bill ${r.invoice_no}` : '')],
          ['Amount', (r) => <b style={{ color: r.direction === 'in' ? 'var(--green)' : undefined }}>{rs(r.amount, 2)}</b>, 'r'], ['Status', (r) => <St s={r.status} />], ['By', (r) => r.created_by_name],
        ]} />
      )}
      {tab === 'book' && (
        <>
          <div className="chips">
            <div className="seg" style={{ marginLeft: 0 }}>{['cash', 'bank'].map((b) => <button key={b} className={book.book === b ? 'on' : ''} onClick={() => setBook({ ...book, book: b })}>{b === 'cash' ? 'Cash book' : 'Bank / UPI book'}</button>)}</div>
            <input type="date" className="input" value={book.from} onChange={(e) => setBook({ ...book, from: e.target.value })} />
            <input type="date" className="input" value={book.to} onChange={(e) => setBook({ ...book, to: e.target.value })} />
          </div>
          {bk.data && (
            <>
              <div className="grid g4" style={{ marginBottom: 14 }}>
                <Kpi label="Opening" value={rs(bk.data.opening, 2)} /><Kpi label="In" value={rs(bk.data.total_in, 2)} tone="green" />
                <Kpi label="Out" value={rs(bk.data.total_out, 2)} tone="red" /><Kpi label="Closing" value={rs(bk.data.closing, 2)} />
              </div>
              <DataTable rows={bk.data.rows} cols={[
                ['Date', (r) => d8(r.dt)], ['No.', (r) => r.no], ['Particulars', (r) => r.particulars], ['Mode', (r) => r.mode],
                ['In', (r) => (Number(r.inflow) ? rs(r.inflow, 2) : ''), 'r'], ['Out', (r) => (Number(r.outflow) ? rs(r.outflow, 2) : ''), 'r'], ['Balance', (r) => rs(r.balance, 2), 'r'],
              ]} />
            </>
          )}
        </>
      )}
      {pay && <PaymentForm direction={pay} onClose={() => setPay(null)} onSaved={() => { setPay(null); out.reload(); pays.reload(); }} />}
    </>
  );
}

export function Recovery() {
  const { meta } = useMeta();
  const list = useApi<any[]>('/erp/recovery/my');
  const log = useApi<any[]>('/erp/recovery');
  const [f, setF] = useState<any>(null);
  const [pay, setPay] = useState<any>(null);
  const a = useAction();
  if (meta && !can(meta, 'recovery')) return <NoAccess />;
  const w = can(meta, 'recovery', true);
  return (
    <>
      <Topbar title="Recovery (udhari)" />
      <ErrorBox msg={a.err} />
      <div className="grid g21">
        <DataTable rows={list.data} empty="No pending dues 🎉" cols={[
          ['Customer', (r) => <>{r.name}<div className="muted"><a href={`tel:${r.mobile}`}><Icon name="phone" size={11} /> {r.mobile}</a></div></>],
          ['Due', (r) => <b>{rs(r.outstanding)}</b>, 'r'], ['Oldest due date', (r) => <span style={{ color: r.oldest_due && r.oldest_due < new Date().toISOString().slice(0, 10) ? 'var(--red)' : undefined }}>{d8(r.oldest_due)}</span>],
          ['Last', (r) => (r.last_followup ? <span className="muted">{r.last_followup.outcome.replace('_', ' ')}{r.last_followup.promise_date ? ` → ${d8(r.last_followup.promise_date)}` : ''}</span> : '—')],
          ['', (r) => w ? <div className="row"><button className="btn sm ghost" onClick={() => setF({ customer_id: r.id, name: r.name, outcome: 'called', note: '' })}>Log call</button><button className="btn sm ok" onClick={() => setPay(r)}>Got payment</button></div> : null],
        ]} />
        <div className="card">
          <h3>Recent follow-ups</h3>
          {(log.data ?? []).slice(0, 25).map((x) => (
            <div key={x.id} className="list-item">
              <div className="between"><b style={{ fontWeight: 500 }}>{x.customer_name}</b><span className="muted">{d8(x.created_at)}</span></div>
              <div className="muted">{x.outcome.replace('_', ' ')}{x.promise_date ? ` · promised ${rs(x.promise_amount)} on ${d8(x.promise_date)}` : ''}{x.note ? ` · ${x.note}` : ''} · {x.by_name}</div>
            </div>
          ))}
        </div>
      </div>
      {f && (
        <Drawer title={`Follow-up · ${f.name}`} onClose={() => setF(null)} modal>
          <Field label="What happened?"><select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}>
            <option value="called">Called / reminded</option><option value="promise">Promised to pay</option><option value="no_response">No response</option><option value="dispute">Dispute</option><option value="note">Note</option></select></Field>
          {f.outcome === 'promise' && <div className="grid g2">
            <Field label="Will pay on"><input type="date" value={f.promise_date ?? ''} onChange={(e) => setF({ ...f, promise_date: e.target.value })} /></Field>
            <Field label="Amount"><input type="number" value={f.promise_amount ?? ''} onChange={(e) => setF({ ...f, promise_amount: e.target.value })} /></Field></div>}
          <Field label="Note"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
          {f.outcome === 'promise' && <p className="muted">A follow-up task is created for the promised date.</p>}
          {['dispute', 'no_response'].includes(f.outcome) && <p className="muted">Manager and boss will be alerted.</p>}
          <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api('/erp/recovery', { body: f }); setF(null); list.reload(); log.reload(); })}>Save</button>
        </Drawer>
      )}
      {pay && <PaymentForm direction="in" partyId={pay.id} amount={Number(pay.outstanding)} onClose={() => setPay(null)} onSaved={() => { setPay(null); list.reload(); log.reload(); }} />}
    </>
  );
}
