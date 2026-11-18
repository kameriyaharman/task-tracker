import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { thisMonth } from '../format';
import { Avatar, ErrorBox, Field, Loading, Person } from '../ui';

export default function Performance() {
  const [month, setMonth] = useState(thisMonth());
  const { data, error, reload } = useApi<any>('/performance', { month });
  const [reward, setReward] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const top = data?.rows?.[0];
  const label = new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long' });

  const announce = async () => {
    const r = await api<any>('/performance/star', { body: { month, reward_text: reward } });
    setMsg(`Announced ${r.star.name} as Star of the Month 🎉`);
    reload();
  };

  return (
    <>
      <Topbar title="Performance & monthly rewards" action={<input type="month" className="input" style={{ width: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />} />
      <ErrorBox msg={error} />
      {msg && <div className="card" style={{ marginBottom: 12, background: 'var(--green-soft)' }}>{msg}</div>}
      {!data ? <Loading /> : (
        <div className="grid g21">
          <div className="card" style={{ padding: 6 }}>
            <table className="t">
              <thead><tr><th>#</th><th>Employee</th><th>Tasks done</th><th>On time</th><th>Attendance</th><th>Manager rating</th><th>Score</th></tr></thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.user_id}>
                    <td className="muted">{r.rank}</td>
                    <td><Person name={r.name} initials={r.initials} sub={r.department} /></td>
                    <td>{r.tasks_done}</td>
                    <td>{r.on_time_pct}%</td>
                    <td>{r.attendance_pct}%</td>
                    <td>{r.rating} ★</td>
                    <td><b style={{ fontSize: 16 }}>{r.score}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="stack">
            {top && (
              <div className="card star">
                <div className="muted" style={{ color: '#E6CFA3' }}>🏆 Star of the Month · {label}</div>
                {(() => {
                  const s = data.star ? data.rows.find((r: any) => r.user_id === +data.star.user_id) ?? top : top;
                  return (
                    <div className="row" style={{ margin: '14px 0' }}>
                      <Avatar initials={s.initials} lg />
                      <div><b style={{ fontSize: 18 }}>{s.name}</b><div style={{ opacity: 0.8, fontSize: 12.5 }}>Score {s.score} · {s.tasks_done} tasks · {s.on_time_pct}% on time</div></div>
                    </div>
                  );
                })()}
                {data.star?.announced_at ? (
                  <div style={{ opacity: 0.85 }}>Announced{data.star.reward_text ? ` · Reward: ${data.star.reward_text}` : ''}</div>
                ) : (
                  <>
                    <Field label="Reward"><input value={reward} onChange={(e) => setReward(e.target.value)} placeholder="₹2,000 voucher" /></Field>
                    <button className="btn" style={{ background: '#fff', color: 'var(--walnut)' }} onClick={announce}>Announce to team</button>
                  </>
                )}
              </div>
            )}
            <div className="card">
              <h3>Score formula</h3>
              <p className="muted" style={{ margin: 0 }}>{data.weights.ontime}% on-time · {data.weights.tasks}% tasks · {data.weights.attendance}% attendance · {data.weights.rating}% rating</p>
              <p className="muted">Change the weights in Settings.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
