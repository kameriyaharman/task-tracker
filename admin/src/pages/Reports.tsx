import { useState } from 'react';
import { downloadUrl } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { thisMonth } from '../format';
import { Bar, ErrorBox, Icon, Loading } from '../ui';

export default function Reports() {
  const [month, setMonth] = useState(thisMonth());
  const { data: d, error } = useApi<any>('/reports/summary', { month });
  const label = new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return (
    <>
      <Topbar title="Reports & analytics" action={<input type="month" className="input" style={{ width: 160 }} value={month} onChange={(e) => setMonth(e.target.value)} />} />
      <ErrorBox msg={error} />
      {!d ? <Loading /> : (
        <div className="stack">
          <div className="grid g6">
            {[['Tasks created', d.tasks_created.toLocaleString('en-IN')], ['Completed', d.tasks_completed.toLocaleString('en-IN')], ['On time', `${d.on_time_pct}%`],
              ['Avg. delay (late tasks)', `${d.avg_delay_hours} h`], ['Attendance', `${d.attendance_pct}%`], ['Overtime', `${d.overtime_hours} h`]].map(([l, v]) => (
              <div className="card kpi" key={l}><small>{l}</small><br /><b>{v}</b></div>
            ))}
          </div>
          <div className="grid g21">
            <div className="card">
              <h3>By department · {label}</h3>
              <table className="t">
                <thead><tr><th>Department</th><th>Created</th><th>Completed</th><th style={{ width: '35%' }}>On time</th></tr></thead>
                <tbody>{d.by_department.map((x: any) => (
                  <tr key={x.name}><td>{x.name}</td><td>{x.created}</td><td>{x.completed ?? 0}</td>
                    <td><div className="row"><div style={{ flex: 1 }}><Bar pct={x.on_time_pct} /></div><b>{x.on_time_pct}%</b></div></td></tr>
                ))}</tbody>
              </table>
            </div>
            <div className="card">
              <h3>Export</h3>
              {[['tasks', 'Task report'], ['performance', 'Team performance'], ['leave', 'Leave report'], ['timesheet', 'Timesheets']].map(([t, l]) => (
                <a key={t} className="list-item between" href={downloadUrl('/reports/export', { type: t, month })}><span>{l}</span><span className="link"><Icon name="download" size={13} /> Excel (CSV)</span></a>
              ))}
              <a className="list-item between" href={downloadUrl('/attendance/export', { month })}><span>Attendance register</span><span className="link"><Icon name="download" size={13} /> Excel (CSV)</span></a>
              <button className="btn ghost sm" style={{ marginTop: 12 }} onClick={() => window.print()}>Print / save as PDF</button>
              <p className="muted">Marketing: {d.campaigns.live} campaigns live · reach {Number(d.campaigns.reach).toLocaleString('en-IN')} · {d.campaigns.leads} leads</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
