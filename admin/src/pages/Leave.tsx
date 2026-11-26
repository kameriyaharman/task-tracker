import { DateInput } from '../dateinput';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { dateOf } from '../format';
import { Badge, Drawer, Empty, ErrorBox, Loading, Person } from '../ui';

export default function Leave() {
  const { me } = useAuth();
  const [status, setStatus] = useState('pending');
  const [type, setType] = useState('');
  const { data, error, reload } = useApi<any[]>('/requests', { box: 'approvals', status, type });
  const policy = useApi<any>('/leave/policy');
  const [err, setErr] = useState<string | null>(null);
  const [editPolicy, setEditPolicy] = useState(false);

  const decide = async (id: number, d: 'approve' | 'reject') => {
    setErr(null);
    try { await api(`/requests/${id}/${d}`, { body: {} }); reload(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <>
      <Topbar title="Leave management" />
      <ErrorBox msg={error || err} />
      <div className="chips">
        {[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['', 'All']].map(([k, l]) => <span key={k} className={`chip ${status === k ? 'on' : ''}`} onClick={() => setStatus(k)}>{l}</span>)}
        <select className="input" style={{ width: 200, marginLeft: 'auto' }} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All requests</option><option value="leave">Leave</option><option value="expense">Expense</option><option value="extension">Deadline extension</option><option value="regularise">Punch regularisation</option>
        </select>
      </div>
      <div className="grid g21">
        <div className="card" style={{ padding: 6 }}>
          {!data ? <Loading /> : data.length ? (
            <table className="t">
              <thead><tr><th>Employee</th><th>Request</th><th>Days</th><th>Tasks handed to</th><th /></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td><Person name={r.user_name} initials={r.user_initials} sub={dateOf(r.created_at)} /></td>
                    <td>{r.type === 'leave' ? <>{r.leave_type_name?.replace(' leave', '')} · {dateOf(r.from_date)}{r.to_date !== r.from_date && `–${dateOf(r.to_date)}`}</> : r.summary}
                      {r.reason && <div className="muted">{r.reason}</div>}</td>
                    <td>{r.days ? +r.days : '—'}</td>
                    <td>{r.handover_name?.split(' ')[0] ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {r.status === 'pending' ? (
                        <><button className="btn ok sm" onClick={() => decide(r.id, 'approve')}>Approve</button>{' '}
                          <button className="btn danger sm" onClick={() => decide(r.id, 'reject')}>Reject</button></>
                      ) : <Badge s={r.status} />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No {status} requests</Empty>}
        </div>
        <div className="card">
          <h3>Leave policy {me?.role === 'owner' && <button className="link" onClick={() => setEditPolicy(true)}>Edit</button>}</h3>
          {!policy.data ? <Loading /> : (
            <>
              {policy.data.types.map((t: any) => (
                <div key={t.id} className="list-item between"><span>{t.name}</span>
                  <b>{+t.yearly_quota ? `${t.yearly_quota} / year${+t.carry_forward_max ? ` · carry fwd ${t.carry_forward_max}` : ''}` : 'On approval'}</b></div>
              ))}
              <div className="list-item">
                <div className="muted" style={{ marginBottom: 4 }}>Holidays</div>
                {policy.data.holidays.length ? policy.data.holidays.map((h: any) => <div key={h.id}>{dateOf(h.holiday_date)} · {h.name}</div>) : <span className="muted">None added</span>}
              </div>
            </>
          )}
        </div>
      </div>
      {editPolicy && policy.data && <PolicyForm p={policy.data} onClose={() => setEditPolicy(false)} onSaved={() => { setEditPolicy(false); policy.reload(); }} />}
    </>
  );
}

function PolicyForm({ p, onClose, onSaved }: { p: any; onClose: () => void; onSaved: () => void }) {
  const [types, setTypes] = useState<any[]>(p.types);
  const [hol, setHol] = useState<any[]>([...p.holidays, { holiday_date: '', name: '' }]);
  const save = async () => {
    await api('/leave/policy', { body: { types, holidays: hol.filter((h) => h.holiday_date && h.name) } });
    onSaved();
  };
  return (
    <Drawer title="Leave policy" onClose={onClose}>
      {types.map((t, i) => (
        <div key={t.id ?? i} className="grid g3" style={{ gap: 8 }}>
          <input className="input" value={t.name} onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
          <input className="input" type="number" title="Per year (0 = on approval)" value={t.yearly_quota} onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, yearly_quota: e.target.value } : x)))} />
          <input className="input" type="number" title="Carry forward max" value={t.carry_forward_max} onChange={(e) => setTypes(types.map((x, j) => (j === i ? { ...x, carry_forward_max: e.target.value } : x)))} />
        </div>
      ))}
      <p className="muted">Name · per year (0 = on approval) · carry-forward max</p>
      <button className="btn ghost sm" onClick={() => setTypes([...types, { name: '', yearly_quota: 0, carry_forward_max: 0 }])}>+ Leave type</button>
      <h3 style={{ margin: '18px 0 8px', fontSize: 14 }}>Holidays</h3>
      {hol.map((h, i) => (
        <div key={i} className="grid g2" style={{ gap: 8, marginBottom: 6 }}>
          <DateInput className="input" value={h.holiday_date} onChange={(e) => { const n = hol.map((x, j) => (j === i ? { ...x, holiday_date: e.target.value } : x)); setHol(i === hol.length - 1 ? [...n, { holiday_date: '', name: '' }] : n); }} />
          <input className="input" value={h.name} placeholder="Diwali" onChange={(e) => setHol(hol.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
        </div>
      ))}
      <button className="btn" style={{ marginTop: 12 }} onClick={save}>Save policy</button>
    </Drawer>
  );
}
