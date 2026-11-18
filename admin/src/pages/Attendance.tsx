import { useState } from 'react';
import { downloadUrl } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { minutes, thisMonth, timeOf } from '../format';
import { Badge, ErrorBox, Icon, Loading, Person } from '../ui';

export default function Attendance() {
  const [month, setMonth] = useState(thisMonth());
  const today = useApi<any>('/attendance/team-today');
  const reg = useApi<any>('/attendance/register', { month });
  const ts = useApi<any>('/timesheet/summary');
  const geo = useApi<any[]>('/geofences');

  return (
    <>
      <Topbar title="Attendance & timesheets"
        action={<a className="btn" href={downloadUrl('/attendance/export', { month })}><Icon name="download" /> Export payroll</a>} />
      <ErrorBox msg={today.error || reg.error} />
      <div className="grid g12" style={{ marginBottom: 14 }}>
        <div className="card">
          <h3>Today</h3>
          {!today.data ? <Loading /> : today.data.people.map((p: any) => {
            const a = p.attendance;
            const sub = a ? `In ${timeOf(a.punch_in_at)} · ${a.place ?? a.mode}${a.has_selfie ? ' · selfie ✓' : ''}${a.punch_out_at ? ` · out ${timeOf(a.punch_out_at)}` : ` · ${minutes(a.worked_minutes)}`}` : p.state === 'leave' ? 'Leave (approved)' : 'Not punched in';
            return (
              <div key={p.user_id} className="list-item between">
                <Person name={p.name} initials={p.initials} sub={sub} />
                <Badge s={p.state === 'not_punched' ? 'absent' : p.state}>{p.state === 'late' ? `Late ${a.late_minutes}m` : undefined}</Badge>
              </div>
            );
          })}
          {today.data && (
            <div className="muted" style={{ marginTop: 12, lineHeight: 1.8 }}>
              <div><b>Shift</b> {today.data.shift.shift_start.slice(0, 5)} – {today.data.shift.shift_end.slice(0, 5)} · grace {today.data.shift.late_grace_min} min</div>
              <div><b>Geofences</b> {geo.data?.map((g) => g.name).join(', ') || '—'}</div>
            </div>
          )}
        </div>

        <div className="card" style={{ overflowX: 'auto' }}>
          <h3>
            <span>Register <span className="muted">P present · L late · F field · LV leave · A absent</span></span>
            <input type="month" className="input" style={{ width: 150 }} value={month} onChange={(e) => setMonth(e.target.value)} />
          </h3>
          {!reg.data ? <Loading /> : (
            <table className="t reg">
              <thead><tr><th>Employee</th>{Array.from({ length: reg.data.days }, (_, i) => <th key={i}>{i + 1}</th>)}<th>Hours</th></tr></thead>
              <tbody>
                {reg.data.rows.map((r: any) => (
                  <tr key={r.user_id}>
                    <td>{r.name}</td>
                    {r.cells.map((c: string, i: number) => <td key={i} className={`c-${c}`}>{c}</td>)}
                    <td><b>{r.hours}h</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Timesheet · this week <a className="link" href={downloadUrl('/reports/export', { type: 'timesheet', month })}>Export month</a></h3>
        {!ts.data ? <Loading /> : ts.data.rows.length ? (
          <table className="t">
            <thead><tr><th>Employee</th><th>Work</th><th>Category</th><th>Hours</th></tr></thead>
            <tbody>{ts.data.rows.map((r: any, i: number) => (
              <tr key={i}><td>{r.name.split(' ')[0]}</td><td>{r.title}</td><td>{r.category ?? '—'}</td><td><b>{Math.round(r.minutes / 6) / 10}h</b></td></tr>
            ))}</tbody>
          </table>
        ) : <div className="empty">No timesheet entries this week. Staff log time from the app with “Start timer”.</div>}
      </div>
    </>
  );
}
