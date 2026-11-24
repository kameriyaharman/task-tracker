import { useState } from 'react';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Avatar, Bar, ErrorBox, Icon, Loading, Person } from '../ui';
import TaskForm from './TaskForm';

export default function Dashboard() {
  const { data: d, error, reload } = useApi<any>('/dashboard');
  const [creating, setCreating] = useState(false);
  const max = d ? Math.max(1, ...d.weekly.flatMap((w: any) => [w.created, w.completed])) : 1;

  return (
    <>
      <Topbar title="Dashboard" action={<button className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> New task</button>} />
      <ErrorBox msg={error} />
      {!d ? <Loading /> : (
        <div className="stack">
          <div className="grid g6">
            <div className="card kpi"><small>Open tasks</small><br /><b>{d.kpis.open_tasks}</b><span>{d.kpis.due_today} due today</span></div>
            <div className="card kpi"><small>Overdue</small><br /><b>{d.kpis.overdue}</b>
              <span className={d.kpis.overdue_delta > 0 ? 'down' : 'up'}>{d.kpis.overdue_delta > 0 ? '+' : ''}{d.kpis.overdue_delta} vs last week</span></div>
            <div className="card kpi"><small>Done this week</small><br /><b>{d.kpis.done_week}</b><span className="up">{d.kpis.done_week_ontime_pct}% on time</span></div>
            <div className="card kpi"><small>Present today</small><br /><b>{d.kpis.present} / {d.kpis.headcount}</b><span>{d.kpis.on_leave} leave · {d.kpis.absent} absent</span></div>
            <div className="card kpi"><small>Hours logged (week)</small><br /><b>{d.kpis.hours_week} h</b></div>
            <div className="card kpi"><small>Goals on track</small><br /><b>{d.kpis.goals_on_track} / {d.kpis.goals_total}</b></div>
          </div>

          <div className="grid g3">
            <div className="card">
              <h3>Department progress</h3>
              {d.department_progress.map((x: any) => (
                <div key={x.id} style={{ marginBottom: 12 }}>
                  <div className="between" style={{ fontSize: 12.5, marginBottom: 4 }}><span>{x.name}</span><b>{x.pct}%</b></div>
                  <Bar pct={x.pct} />
                </div>
              ))}
            </div>
            <div className="card">
              <h3>Attendance today</h3>
              <div className="grid g2">
                {[['On time', d.attendance_today.on_time], ['Late', d.attendance_today.late], ['Field', d.attendance_today.field],
                  ['Leave / absent', `${d.attendance_today.leave} / ${d.attendance_today.absent}`]].map(([l, v]) => (
                  <div key={l} style={{ background: '#F7F1E7', borderRadius: 10, padding: '10px 12px' }}>
                    <div className="muted">{l}</div><b style={{ fontSize: 18 }}>{v}</b>
                  </div>
                ))}
              </div>
              {d.pending_approvals > 0 && <p className="muted" style={{ marginTop: 12 }}>{d.pending_approvals} approvals waiting — see Leave</p>}
            </div>
            <div className="card">
              <h3>Top performers</h3>
              {d.top_performers.slice(0, 5).map((p: any) => (
                <div key={p.user_id} className="list-item between">
                  <div className="row"><Avatar initials={p.initials} /> {p.name.split(' ')[0]}</div><b>{p.score}</b>
                </div>
              ))}
            </div>
          </div>
            <div className="card">
              <h3>Overdue by person</h3>
              {d.overdue_by_person.length ? d.overdue_by_person.map((p: any) => (
                <div key={p.id} className="list-item between">
                  <Person name={p.name} sub={p.department} />
                  <span className="badge overdue">{p.overdue}</span>
                </div>
              )) : <div className="empty">Nothing overdue 🎉</div>}
            </div>
          <div className="card">
              <h3>Tasks completed vs created · last 8 weeks
                <span className="legend"><span><i style={{ background: '#D4A24C' }} />Completed</span><span><i style={{ background: 'var(--walnut)' }} />Created</span></span>
              </h3>
              <div className="bars">
                {d.weekly.map((w: any) => (
                  <div className="w" key={w.label} title={`${w.completed} completed · ${w.created} created`}>
                    <div className="pair">
                      <i style={{ height: `${(w.completed / max) * 100}%` }} />
                      <i className="b" style={{ height: `${(w.created / max) * 100}%` }} />
                    </div>
                    <small>{w.label}</small>
                  </div>
                ))}
              </div>
            </div>
        </div>
      )}
      {creating && <TaskForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
    </>
  );
}
