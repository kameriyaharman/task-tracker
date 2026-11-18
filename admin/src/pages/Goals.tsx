import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { inr } from '../format';
import { Badge, Bar, Drawer, Empty, ErrorBox, Field, Icon, Loading } from '../ui';

const fmt = (v: number, unit?: string) => (unit === '₹' ? inr(v) : `${Math.round(v)}${unit && unit !== '%' ? ` ${unit}` : ''}`);

export default function Goals() {
  const { data, error, reload } = useApi<any[]>('/goals');
  const [edit, setEdit] = useState<any | null>(null);

  return (
    <>
      <Topbar title="Goals" action={<button className="btn" onClick={() => setEdit({})}><Icon name="plus" /> New goal</button>} />
      <ErrorBox msg={error} />
      {!data ? <Loading /> : data.length ? (
        <div className="grid g2">
          {data.map((g) => (
            <div className="card" key={g.id} style={{ cursor: 'pointer' }} onClick={() => setEdit(g)}>
              <div className="between"><b style={{ fontSize: 16 }}>{g.title}</b><Badge s={g.status} /></div>
              <div className="muted" style={{ margin: '2px 0 12px' }}>{g.scope_label}{g.period_label ? ` · ${g.period_label}` : ''}</div>
              <div className="between" style={{ marginBottom: 6 }}>
                <span>{g.unit === '₹' ? `${fmt(+g.current_value, g.unit)} achieved` : g.unit === '%' ? `${g.tasks_overdue} overdue now` : `${fmt(+g.current_value)} / ${fmt(+g.target_value, g.unit)}`}</span>
                <b>{g.progress_pct}%</b>
              </div>
              <Bar pct={g.progress_pct} />
              {(g.children.length > 0 || g.tasks.length > 0) && (
                <div style={{ marginTop: 12 }} className="tools">
                  {g.children.map((c: any) => <span key={c.id} className="badge">{c.title} · {c.progress_pct}%</span>)}
                  {g.tasks.map((t: any) => <span key={t.id} className="badge">{+t.is_recurring ? '↻ ' : ''}{t.title}</span>)}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : <Empty>No goals yet — add company or team goals and link tasks to them.</Empty>}
      {edit && <GoalForm goal={edit} parents={data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function GoalForm({ goal, parents, onClose, onSaved }: { goal: any; parents: any[]; onClose: () => void; onSaved: () => void }) {
  const depts = useApi<any[]>('/departments');
  const [f, setF] = useState({
    title: goal.title ?? '', scope: goal.scope ?? 'company', department_id: goal.department_id ?? '', parent_id: goal.parent_id ?? '',
    period_label: goal.period_label ?? '', target_value: goal.target_value ?? 100, current_value: goal.current_value ?? 0, unit: goal.unit ?? '', status: goal.status ?? 'on_track',
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    try {
      const body = { ...f, department_id: f.department_id || null, parent_id: f.parent_id || null };
      if (goal.id) await api(`/goals/${goal.id}`, { method: 'PATCH', body }); else await api('/goals', { body });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Drawer title={goal.id ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <ErrorBox msg={err} />
      <Field label="Goal"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Close 40 deals" /></Field>
      <div className="grid g2">
        <Field label="Scope"><select value={f.scope} onChange={(e) => set('scope', e.target.value)}><option value="company">Company</option><option value="department">Department</option></select></Field>
        <Field label="Department"><select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}><option value="">All</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Target"><input type="number" value={f.target_value} onChange={(e) => set('target_value', e.target.value)} /></Field>
        <Field label="Achieved so far"><input type="number" value={f.current_value} onChange={(e) => set('current_value', e.target.value)} /></Field>
        <Field label="Unit (₹, deals, %…)"><input value={f.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
        <Field label="Period"><input value={f.period_label} onChange={(e) => set('period_label', e.target.value)} placeholder="Q4 (Oct–Dec)" /></Field>
        <Field label="Status"><select value={f.status} onChange={(e) => set('status', e.target.value)}><option value="on_track">On track</option><option value="at_risk">At risk</option><option value="behind">Behind</option><option value="done">Done</option></select></Field>
        <Field label="Part of"><select value={f.parent_id} onChange={(e) => set('parent_id', e.target.value)}><option value="">—</option>{parents.filter((p) => p.id !== goal.id).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></Field>
      </div>
      <div className="row">
        <button className="btn" disabled={!f.title} onClick={save}>Save</button>
        {goal.id && <button className="btn danger" onClick={() => confirm('Delete goal?') && api(`/goals/${goal.id}`, { method: 'DELETE' }).then(onSaved)}>Delete</button>}
      </div>
    </Drawer>
  );
}
