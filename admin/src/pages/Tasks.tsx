import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { dueLabel, parseDate, toLocalInput } from '../format';
import { Empty, ErrorBox, Icon, Loading, Person, Pri, TaskStatus } from '../ui';
import TaskForm from './TaskForm';
import TaskDetail from './TaskDetail';

const filters: [string, string][] = [['all', 'All'], ['overdue', 'Overdue'], ['escalated', 'Escalated'], ['today', 'Today'], ['upcoming', 'Upcoming'], ['recurring', 'Recurring'], ['approval', 'Waiting approval'], ['done', 'Done']];

export default function Tasks() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('all');
  const [view, setView] = useState<'list' | 'board' | 'calendar'>('list');
  const [dept, setDept] = useState('');
  const [pri, setPri] = useState('');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  const depts = useApi<any[]>('/departments');
  const calRange = useMemo(() => {
    const from = new Date(month); from.setDate(1 - ((from.getDay() + 6) % 7));
    const to = new Date(from); to.setDate(from.getDate() + 42);
    return { from: toLocalInput(from).slice(0, 10), to: toLocalInput(to).slice(0, 10) };
  }, [month]);
  const { data, error, loading, reload } = useApi<any>('/tasks', {
    scope: 'team', filter: view === 'calendar' ? 'all' : filter, department_id: dept, priority: pri, q, per_page: view === 'list' ? 100 : 200,
    ...(view === 'calendar' ? calRange : {}),
  });
  const items: any[] = data?.items ?? [];

  return (
    <>
      <Topbar title="Tasks" search={q} onSearch={(v) => { setQ(v); setParams(v ? { q: v } : {}); }}
        action={<button className="btn" onClick={() => setCreating(true)}><Icon name="plus" /> New task</button>} />
      <ErrorBox msg={error} />
      <div className="task-search">
        <input className="input" type="search" value={q} placeholder="🔍 Search tasks — title, person, checklist…" onChange={(e) => { setQ(e.target.value); setParams(e.target.value ? { q: e.target.value } : {}); }} />
        <select className="input" value={pri} onChange={(e) => setPri(e.target.value)}>
          <option value="">Any priority</option><option value="urgent">Urgent</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
      </div>
      <div className="chips">
        {filters.map(([k, l]) => (
          <span key={k} className={`chip ${filter === k ? 'on' : ''}`} onClick={() => setFilter(k)}>{l}{data?.counts?.[k] !== undefined && <b>{data.counts[k]}</b>}</span>
        ))}
        <select className="input" style={{ width: 170 }} value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="">All departments</option>
          {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="seg">
          {(['list', 'board', 'calendar'] as const).map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
        </div>
      </div>

      {loading && !data ? <Loading /> : view === 'list' ? (
        <div className="card" style={{ padding: 6 }}>
          {items.length ? (
            <table className="t tasks-t">
              <thead><tr><th>Task</th><th>Assigned to</th><th>By</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id} className="click" onClick={() => setOpen(t.id)}>
                    <td style={{ fontWeight: 500 }}>{+t.is_emergency ? '🚨 ' : ''}{t.title}{+t.escalation_level > 0 && t.status !== 'done' ? <span className="badge overdue" style={{ marginLeft: 6 }}>L{t.escalation_level}</span> : null}{t.approval_status === 'pending' ? <span className="badge" style={{ marginLeft: 6 }}>needs approval</span> : null}<div className="muted mobile-only">{t.assignee_name.split(' ')[0]} · {dueLabel(t.due_at)}</div>{t.checklist_total > 0 && <span className="muted"> · {t.checklist_done}/{t.checklist_total}</span>}</td>
                    <td><Person name={t.assignee_name.split(' ')[0]} initials={t.assignee_initials} /></td>
                    <td>{t.assigner_name.split(' ')[0]}</td>
                    <td>{t.repeat_frequency ? `${t.repeat_frequency[0].toUpperCase()}${t.repeat_frequency.slice(1)} · ` : ''}{dueLabel(t.due_at)}</td>
                    <td><Pri p={t.priority} /></td>
                    <td><TaskStatus t={t} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No tasks here</Empty>}
        </div>
      ) : view === 'board' ? (
        <div className="board">
          {[['not_started', 'Not started'], ['in_progress', 'In progress'], ['overdue', 'Overdue'], ['done', 'Done']].map(([s, l]) => {
            const col = items.filter((t) => (s === 'overdue' ? t.display_status === 'overdue' : t.display_status === s));
            return (
              <div className="col" key={s}>
                <h4>{l} <span className="muted">{col.length}</span></h4>
                {col.map((t) => (
                  <div className="bcard" key={t.id} onClick={() => setOpen(t.id)}>
                    <b>{t.title}</b>
                    <div className="between"><span className="muted">{dueLabel(t.due_at)} · <Pri p={t.priority} /></span><Person name="" initials={t.assignee_initials} /></div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="card">
          <div className="between" style={{ marginBottom: 12 }}>
            <button className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
            <b>{month.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</b>
            <button className="btn ghost sm" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
          </div>
          <div className="cal">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="muted" style={{ textAlign: 'center' }}>{d}</div>)}
            {Array.from({ length: 42 }, (_, i) => {
              const day = new Date(calRange.from); day.setDate(day.getDate() + i);
              const ds = day.toDateString();
              const list = items.filter((t) => parseDate(t.due_at)?.toDateString() === ds);
              return (
                <div key={i} className={`d ${ds === new Date().toDateString() ? 'today' : ''}`} style={{ opacity: day.getMonth() === month.getMonth() ? 1 : 0.45 }}>
                  <div className="n">{day.getDate()}</div>
                  {list.slice(0, 4).map((t) => <div key={t.id} className={`ev ${t.display_status}`} onClick={() => setOpen(t.id)} title={`${t.title} · ${t.assignee_name}`}>{t.title}</div>)}
                  {list.length > 4 && <div className="muted">+{list.length - 4} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {creating && <TaskForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />}
      {open && <TaskDetail id={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </>
  );
}
