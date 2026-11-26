import { DateInput } from '../dateinput';
import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { DataTable, Kpi, NoAccess, Select, St, Tabs, can, d8, rs, useAction, useList, useMeta } from './common';

/** Receive from customer / pay vendor — against a specific bill (or PO advance), part or full. */
export function PaymentForm({ direction, partyId, amount, invoiceId, onClose, onSaved }: { direction: 'in' | 'out'; partyId?: any; amount?: number; invoiceId?: any; onClose: () => void; onSaved: () => void }) {
  const parties = useList(direction === 'in' ? 'customers' : 'vendors');
  const isIn = direction === 'in';
  const [f, setF] = useState<any>({ party_id: partyId ?? '', amount: amount ? Math.round(amount) : '', mode: isIn ? 'cash' : 'bank', reference: '', pay_date: new Date().toISOString().slice(0, 10), notes: '',
    bill: invoiceId ? String(invoiceId) : '', settlement: invoiceId ? 'full' : 'on_account', po_id: '' });
  const ob = useApi<any>(f.party_id ? '/erp/open-bills' : null, { party: isIn ? 'customer' : 'vendor', id: f.party_id });
  const bills: any[] = ob.data?.bills ?? [];
  const bill = bills.find((b) => String(b.id) === String(f.bill));
  const p = (parties.data ?? []).find((x) => String(x.id) === String(f.party_id));
  const a = useAction();
  const pickBill = (id: string) => {
    const b = bills.find((x) => String(x.id) === id);
    setF({ ...f, bill: id, settlement: id ? 'full' : 'on_account', amount: b ? Number(b.due) : f.amount, po_id: '' });
  };
  const err = bill && f.settlement === 'full' && Math.abs(Number(f.amount) - Number(bill.due)) > 0.5 ? `Full payment of ${bill.no} is ${rs(bill.due, 2)}`
    : bill && f.settlement === 'part' && Number(f.amount) > Number(bill.due) + 0.5 ? `More than the balance of ${bill.no} (${rs(bill.due, 2)})` : null;
  const save = () => a.run(async () => {
    const body: any = { direction, party_id: f.party_id, amount: f.amount, mode: f.mode, reference: f.reference, pay_date: f.pay_date, notes: f.notes, settlement: f.settlement };
    if (f.bill) body[isIn ? 'invoice_id' : 'grn_id'] = f.bill;
    if (!isIn && f.po_id) body.po_id = f.po_id;
    await api('/erp/payments', { body }); onSaved();
  });
  return (
    <Drawer title={isIn ? 'Receive payment from customer' : 'Pay vendor'} onClose={onClose} modal>
      <ErrorBox msg={a.err} />
      <Field label={isIn ? 'Customer' : 'Vendor'}><Select value={f.party_id} onChange={(v) => setF({ ...f, party_id: v, bill: '', settlement: 'on_account' })} options={(parties.data ?? []).map((x) => ({ id: x.id, name: `${x.code ? `#${x.code} ` : ''}${x.business_name || x.name} · due ${rs(x.outstanding)}` }))} placeholder="Choose" /></Field>
      {p && (
        <div className="card" style={{ padding: 10, marginBottom: 10 }}>
          <div className="between"><span>Total balance</span><b>{rs(ob.data?.outstanding ?? p.outstanding, 2)}</b></div>
          {bills.length > 0 && (
            <table className="t" style={{ marginTop: 6 }}>
              <thead><tr><th>Bill</th><th>Date</th><th className="r">Bill amt</th><th className="r">Balance</th><th className="r">Age</th></tr></thead>
              <tbody>{bills.map((b) => (
                <tr key={b.id} className={`click ${String(b.id) === String(f.bill) ? 'sel' : ''}`} onClick={() => pickBill(String(b.id))}>
                  <td>{b.no}{b.po_no ? <div className="muted">PO {b.po_no}</div> : null}</td><td>{d8(b.dt)}</td><td className="r">{rs(b.total)}</td><td className="r"><b>{rs(b.due)}</b></td>
                  <td className="r"><span className={`badge ${+b.age > 60 ? 'overdue' : ''}`}>{b.age} d</span></td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {!bills.length && ob.data && <p className="muted" style={{ margin: '6px 0 0' }}>No unpaid bills{Number(ob.data.outstanding) > 0 ? ' — balance is old dues (opening balance)' : ''}.</p>}
        </div>
      )}
      <div className="grid g2">
        <Field label="Against which bill">
          <select value={f.bill} onChange={(e) => pickBill(e.target.value)}>
            <option value="">{isIn ? 'No specific bill (oldest first)' : 'No bill — on account / PO advance'}</option>
            {bills.map((b) => <option key={b.id} value={b.id}>{b.no} · balance {rs(b.due)} · {b.age} days</option>)}
          </select>
        </Field>
        <Field label="Payment is">
          <select value={f.settlement} onChange={(e) => setF({ ...f, settlement: e.target.value, amount: e.target.value === 'full' && bill ? Number(bill.due) : f.amount })}>
            {f.bill ? <><option value="full">Full & final for this bill</option><option value="part">Part payment</option></> : <><option value="on_account">On account</option>{!isIn && <option value="advance">Advance against PO</option>}</>}
          </select>
        </Field>
        {!isIn && !f.bill && f.settlement === 'advance' && (
          <Field label="Purchase order"><select value={f.po_id} onChange={(e) => setF({ ...f, po_id: e.target.value })}><option value="">Choose PO</option>{(ob.data?.pos ?? []).map((po: any) => <option key={po.id} value={po.id}>{po.po_no} · {rs(po.total)} · {po.status}</option>)}</select></Field>
        )}
        <Field label="Amount (₹)"><input type="number" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Mode"><select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank / NEFT</option><option value="cheque">Cheque</option><option value="card">Card</option></select></Field>
        <Field label="Reference (UTR / cheque no.)"><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Date"><DateInput max={new Date().toISOString().slice(0, 10)} value={f.pay_date} onChange={(e) => setF({ ...f, pay_date: e.target.value })} /></Field>
      </div>
      {bill && Number(f.amount) > 0 && !err && <p className="muted">After this, {bill.no} balance: <b>{rs(Math.max(0, Number(bill.due) - Number(f.amount)), 2)}</b></p>}
      {err && <p className="field-err">{err}</p>}
      <Field label="Note"><input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {!isIn && <p className="muted">Vendor payments go for approval before they are counted.</p>}
      <button className="btn" disabled={!f.party_id || !(Number(f.amount) > 0) || !!err || (f.settlement === 'advance' && !f.po_id) || a.busy} onClick={save}>Save</button>
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
  const [q, setQ] = useState('');
  const [age, setAge] = useState('');
  const rows = (out.data ?? []).filter((r) => (!q || `${r.code} ${r.name} ${r.business_name ?? ''} ${r.mobile ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    && (!age || (age === '30' ? r.oldest_days > 30 : age === '60' ? r.oldest_days > 60 : age === '90' ? r.oldest_days > 90 : true)));
  const sum = (k: string) => rows.reduce((s, r) => s + Number(r[k] || 0), 0);
  return (
    <>
      <Topbar title="Accounts" action={<div className="row">
        {(w || can(meta, 'recovery', true)) && <button className="btn ok" onClick={() => setPay('in')}>Receive payment</button>}
        {w && <button className="btn" onClick={() => setPay('out')}>Pay vendor</button>}
      </div>} />
      <Tabs value={tab} onChange={setTab} tabs={[['receivable', 'Customers owe us'], ...(can(meta, 'accounts') ? [['payable', 'We owe vendors'], ['payments', 'Receipts & payments'], ['book', 'Cash / bank book']] as [string, string][] : [])]} />
      {['receivable', 'payable'].includes(tab) && (
        <>
          <div className="goal-help">
            {tab === 'receivable'
              ? <><b>Customers owe us (udhari):</b> money customers still have to pay. The columns show <b>how old the unpaid bills are</b> — e.g. "31–60 days" = bills made 31 to 60 days ago that are still unpaid. Older = more risky; follow up the red ones first.</>
              : <><b>We owe vendors:</b> money we still have to pay to suppliers, split by how old their bills are.</>}
          </div>
          <div className="grid g6" style={{ marginBottom: 14 }}>
            <Kpi label="Total due" value={rs(sum('outstanding'))} sub={`${rows.length} parties`} />
            <Kpi label="0–7 days old" value={rs(sum('b0_7'))} /><Kpi label="8–30 days" value={rs(sum('b8_30'))} />
            <Kpi label="31–60 days" value={rs(sum('b31_60'))} /><Kpi label="61–90 days" value={rs(sum('b61_90'))} tone={sum('b61_90') > 0 ? 'red' : undefined} />
            <Kpi label="Over 90 days" value={rs(sum('b90'))} tone={sum('b90') > 0 ? 'red' : undefined} />
          </div>
          <div className="task-search">
            <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search name, code or mobile" />
            <select className="input" value={age} onChange={(e) => setAge(e.target.value)}><option value="">All ages</option><option value="30">Older than 30 days</option><option value="60">Older than 60 days</option><option value="90">Older than 90 days</option></select>
            <a className="btn ghost" href={`data:text/csv;charset=utf-8,${encodeURIComponent(['Code,Name,Mobile,Total due,0-7,8-30,31-60,61-90,90+,Oldest bill (days)', ...rows.map((r) => [r.code ?? '', `"${r.business_name || r.name}"`, r.mobile ?? '', r.outstanding, r.b0_7, r.b8_30, r.b31_60, r.b61_90, r.b90, r.oldest_days].join(','))].join('\n'))}`} download={`${tab}-aging.csv`}>⬇ Excel</a>
          </div>
          <DataTable rows={out.data ? rows : null} cols={[
            ['Name', (r) => <>{r.code ? <b>#{r.code} </b> : null}{r.business_name || r.name}<div className="muted">{r.mobile ?? ''}{r.recovery_user ? ` · ${r.recovery_user}` : ''}{r.bills ? ` · ${r.bills} bills, oldest ${r.oldest_days} d` : ''}</div></>],
            ['Total due', (r) => <b>{rs(r.outstanding)}</b>, 'r'], ['0–7', (r) => rs(r.b0_7), 'r'], ['8–30', (r) => rs(r.b8_30), 'r'], ['31–60', (r) => rs(r.b31_60), 'r'],
            ['61–90', (r) => rs(r.b61_90), 'r'], ['90+', (r) => <span style={{ color: Number(r.b90) ? 'var(--red)' : undefined }}>{rs(r.b90)}</span>, 'r'],
            ...(tab === 'receivable' ? [['Last follow-up', (r: any) => (r.last_followup ? <span className="muted">{r.last_followup.outcome.replace('_', ' ')}{r.last_followup.promise_date ? ` · ${d8(r.last_followup.promise_date)}` : ''}</span> : '—')] as [string, (r: any) => any]] : []),
          ]} />
        </>
      )}
      {tab === 'payments' && (
        <DataTable rows={pays.data} cols={[
          ['No.', (r) => r.pay_no], ['Date', (r) => d8(r.pay_date)], ['Type', (r) => (r.direction === 'in' ? 'Received' : 'Paid')], ['Party', (r) => r.party_name],
          ['Mode', (r) => <St s={r.mode} />], ['Against', (r) => <>{r.invoice_no || r.grn_no || (r.po_no ? `PO ${r.po_no}` : 'On account')}{r.settlement ? <div className="muted">{({ full: 'Full & final', part: 'Part', advance: 'Advance', on_account: 'On account' } as any)[r.settlement]}</div> : null}</>],
          ['Ref', (r) => r.reference ?? ''],
          ['Amount', (r) => <b style={{ color: r.direction === 'in' ? 'var(--green)' : undefined }}>{rs(r.amount, 2)}</b>, 'r'], ['Status', (r) => <St s={r.status} />], ['By', (r) => r.created_by_name],
        ]} />
      )}
      {tab === 'book' && (
        <>
          <div className="chips">
            <div className="seg" style={{ marginLeft: 0 }}>{['cash', 'bank'].map((b) => <button key={b} className={book.book === b ? 'on' : ''} onClick={() => setBook({ ...book, book: b })}>{b === 'cash' ? 'Cash book' : 'Bank / UPI book'}</button>)}</div>
            <DateInput className="input" value={book.from} onChange={(e) => setBook({ ...book, from: e.target.value })} />
            <DateInput className="input" value={book.to} onChange={(e) => setBook({ ...book, to: e.target.value })} />
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
            <Field label="Will pay on"><DateInput value={f.promise_date ?? ''} onChange={(e) => setF({ ...f, promise_date: e.target.value })} /></Field>
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
