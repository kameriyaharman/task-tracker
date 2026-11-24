import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, Empty, ErrorBox, Field, Icon, Loading, Pri } from '../ui';

/** Standard tasks with a short code — pick one in "New task" to fill everything in one tap. */
export default function Templates() {
  const { data, error, reload } = useApi<any[]>('/task-templates');
  const [edit, setEdit] = useState<any | null>(null);

  return (
    <>
      <Topbar title="Task rules & templates" action={<button className="btn" onClick={() => setEdit({})}><Icon name="plus" /> New template</button>} />
      <ErrorBox msg={error} />
      <TaskRulesCard />
      {!data ? <Loading /> : (
        <div className="card" style={{ padding: 6 }}>
          {data.length ? (
            <table className="t">
              <thead><tr><th>Code</th><th>Task</th><th>Department</th><th>Priority</th><th>Steps</th><th>Proof</th><th>Due in</th><th /></tr></thead>
              <tbody>
                {data.map((t) => (
                  <tr key={t.id} className="click" onClick={() => setEdit(t)}>
                    <td><b>{t.code}</b></td><td>{t.title}</td><td>{t.department_name ?? '—'}</td><td><Pri p={t.priority} /></td>
                    <td>{t.checklist.length || '—'}</td><td>{t.proof_type ?? '—'}</td><td>{t.due_hours ? `${t.due_hours} h` : 'default'}</td>
                    <td><button className="link" onClick={(e) => { e.stopPropagation(); confirm(`Delete template ${t.code}?`) && api(`/task-templates/${t.id}`, { method: 'DELETE' }).then(reload); }}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No templates yet</Empty>}
        </div>
      )}
      {edit && <TemplateForm t={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function TemplateForm({ t, onClose, onSaved }: { t: any; onClose: () => void; onSaved: () => void }) {
  const depts = useApi<any[]>('/departments');
  const [f, setF] = useState({ code: t.code ?? '', title: t.title ?? '', description: t.description ?? '', department_id: t.department_id ?? '', priority: t.priority ?? 'medium', due_hours: t.due_hours ?? '', proof: (t.proof_type ?? '').split(',').filter(Boolean) as string[] });
  const [steps, setSteps] = useState<string[]>([...(t.checklist ?? []).map((c: any) => (typeof c === 'string' ? c : c.label)), '']);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.title.trim()) return setErr('Write the task');
    try {
      const body = { ...f, proof_type: f.proof.join(','), department_id: f.department_id || null, due_hours: f.due_hours || null, checklist: steps.filter((x) => x.trim()) };
      await api(t.id ? `/task-templates/${t.id}` : '/task-templates', { method: t.id ? 'PATCH' : 'POST', body });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Drawer title={t.id ? `Template ${t.code}` : 'New template'} onClose={onClose}>
      <ErrorBox msg={err} />
      <div className="grid g2">
        <Field label="Code"><input value={f.code} placeholder="auto (T07)" onChange={(e) => set('code', e.target.value.toUpperCase())} /></Field>
        <Field label="Priority"><select value={f.priority} onChange={(e) => set('priority', e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
      </div>
      <Field label="Task *"><input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <Field label="Details"><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="grid g2">
        <Field label="Department"><select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}><option value="">—</option>{depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Due in (hours)"><input type="number" min={1} value={f.due_hours} placeholder="default" onChange={(e) => set('due_hours', e.target.value)} /></Field>
      </div>
      <div className="field"><span>Checklist steps</span>
        {steps.map((c, i) => <input key={i} className="input" style={{ marginBottom: 6 }} value={c} placeholder={`Step ${i + 1}`}
          onChange={(e) => { const n = [...steps]; n[i] = e.target.value; setSteps(i === n.length - 1 && e.target.value ? [...n, ''] : n); }} />)}
      </div>
      <div className="field"><span>Proof</span><div className="tools">
        {['photo', 'file', 'location', 'link'].map((p) => <label key={p} className={f.proof.includes(p) ? 'on' : ''} onClick={() => set('proof', f.proof.includes(p) ? f.proof.filter((x) => x !== p) : [...f.proof, p])}>{p}</label>)}
      </div></div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center' }} onClick={save}>Save template</button>
    </Drawer>
  );
}

/** Default due window, approval of staff requests, escalation chain (level 1 → 4). */
function TaskRulesCard() {
  const r = useApi<any>('/task-defaults');
  const people = useApi<any[]>('/employees');
  const [lv, setLv] = useState<any[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!r.data) return <Loading />;
  const levels = lv ?? r.data.escalation;
  const save = async (body: any) => {
    setErr(null);
    try { await api('/task-defaults', { method: 'PATCH', body }); r.reload(); setMsg('Saved'); setTimeout(() => setMsg(null), 1500); } catch (e) { setErr((e as Error).message); }
  };
  const targets = Object.entries(r.data.targets as Record<string, string>);
  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <ErrorBox msg={err} />
      <div className="row" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
        <span>When no due time is chosen, a task is due in</span>
        <select className="input" style={{ width: 110 }} value={r.data.default_due_hours} onChange={(e) => save({ default_due_hours: +e.target.value })}>
          {[2, 4, 6, 8, 12, 24, 48].map((h) => <option key={h} value={h}>{h} hours</option>)}
        </select>
        {msg && <span className="ok-text">✓ {msg}</span>}
      </div>
      <label className="switch-row">
        <input type="checkbox" checked={r.data.task_approval} onChange={(e) => save({ task_approval: e.target.checked })} />
        <span><b>Staff task requests need approval</b> — anyone can create a task for a colleague; it reaches them after their manager (or department head / boss, or that person's deputy) approves.</span>
      </label>
      <h3 style={{ marginTop: 14 }}>Escalation — if a task is still open after its due time</h3>
      {levels.map((l: any, i: number) => (
        <div key={i} className="row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
          <b style={{ width: 62 }}>Level {i + 1}</b>
          <input className="input" type="number" min={1} style={{ width: 80 }} value={l.after_hours} onChange={(e) => setLv(levels.map((x: any, j: number) => (j === i ? { ...x, after_hours: +e.target.value } : x)))} />
          <span>hours late → tell</span>
          <select className="input" style={{ width: 200 }} value={l.to} onChange={(e) => setLv(levels.map((x: any, j: number) => (j === i ? { ...x, to: e.target.value } : x)))}>
            {targets.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            {(people.data ?? []).map((p) => <option key={p.id} value={`user:${p.id}`}>{p.name}</option>)}
          </select>
          <button className="link" onClick={() => setLv(levels.filter((_: any, j: number) => j !== i))}>✕</button>
        </div>
      ))}
      <div className="row">
        {levels.length < 4 && <button className="btn ghost sm" onClick={() => setLv([...levels, { after_hours: (levels[levels.length - 1]?.after_hours ?? 0) + 24, to: 'owner' }])}>+ Add level</button>}
        {lv && <button className="btn sm" onClick={() => save({ escalation: lv }).then(() => setLv(null))}>Save escalation</button>}
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>Each level gets a notification and can open the task; the task shows "Escalated · level N".</p>
    </div>
  );
}
