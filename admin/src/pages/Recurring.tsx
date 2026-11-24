import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { dateOf } from '../format';
import { Avatar, Drawer, Empty, ErrorBox, Field, Icon, Loading } from '../ui';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Recurring() {
  const { data, error, reload } = useApi<any[]>('/recurring');
  const [form, setForm] = useState(false);

  const nextLabel = (d?: string) => {
    if (!d) return '—';
    const t = new Date(); const tm = new Date(); tm.setDate(t.getDate() + 1);
    const x = new Date(d);
    if (x.toDateString() === t.toDateString()) return 'Today';
    if (x.toDateString() === tm.toDateString()) return 'Tomorrow';
    return x.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  return (
    <>
      <Topbar title="Recurring tasks" action={<button className="btn" onClick={() => setForm(true)}><Icon name="plus" /> New recurring task</button>} />
      <ErrorBox msg={error} />
      {!data ? <Loading /> : (
        <div className="card" style={{ padding: 6 }}>
          {data.length ? (
            <table className="t">
              <thead><tr><th>Task</th><th>Repeats</th><th>Assigned</th><th>Next</th><th>Done on time (30 d)</th><th>Proof</th><th /></tr></thead>
              <tbody>
                {data.map((r) => (
                  <tr key={r.id}>
                    <td style={{ fontWeight: 500 }}>{r.title}{r.checklist.length > 0 && <span className="muted"> · {r.checklist.length} steps</span>}</td>
                    <td>{r.repeat_label}</td>
                    <td><div className="row">{(r.rotation.length ? r.rotation : [{ name: r.assignee_name }]).map((p: any, i: number) => <Avatar key={i} name={p.name} />)}
                      <span>{r.rotation.length > 1 ? `${r.assignee_names} (rotate)` : r.assignee_names?.split(' ')[0]}</span></div></td>
                    <td>{nextLabel(r.next_dates[0])} {r.due_time.slice(0, 5)}</td>
                    <td>{r.on_time_pct === null ? <span className="muted">—</span> : <b style={{ color: r.on_time_pct >= 90 ? 'var(--green)' : r.on_time_pct >= 75 ? 'var(--amber)' : 'var(--red)' }}>{r.on_time_pct}%</b>}</td>
                    <td>{r.proof_type ? r.proof_type.split(',').map((p: string) => p[0].toUpperCase() + p.slice(1)).join(' + ') : '—'}</td>
                    <td><button className="link" onClick={() => confirm(`Stop "${r.title}"? Past tasks stay.`) && api(`/recurring/${r.id}`, { method: 'DELETE' }).then(reload)}>Stop</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No recurring tasks yet</Empty>}
        </div>
      )}
      {form && <RecurringForm onClose={() => setForm(false)} onSaved={() => { setForm(false); reload(); }} />}
    </>
  );
}

function RecurringForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const people = useApi<any[]>('/employees');
  const [f, setF] = useState({ title: '', frequency: 'daily', weekdays: [1, 2, 3, 4, 5, 6], month_day: 1, interval_days: 2, due_time: '10:00', start_time: '', starts_on: '', ends_on: '', priority: 'medium', proof: [] as string[], rotation: [] as number[] });
  const [checklist, setChecklist] = useState(['']);
  const [preview, setPreview] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const doPreview = async (next = f) => {
    const r = await api<{ next: string[] }>('/recurring/preview', { body: { frequency: next.frequency, weekdays: next.weekdays, month_day: next.month_day, interval_days: next.interval_days, ends_on: next.ends_on || null } });
    setPreview(r.next);
  };
  const upd = (k: string, v: unknown) => { const n = { ...f, [k]: v }; setF(n); doPreview(n).catch(() => {}); };

  const save = async () => {
    try {
      await api('/recurring', { body: { ...f, proof_type: f.proof.join(','), ends_on: f.ends_on || null, starts_on: f.starts_on || null, start_time: f.start_time || null, assigned_to: f.rotation[0], rotation: f.rotation.length > 1 ? f.rotation : [], checklist: checklist.filter(Boolean) } });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };

  return (
    <Drawer title="New recurring task" onClose={onClose}>
      <ErrorBox msg={err} />
      <Field label="Task"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Daily machine maintenance checklist" /></Field>
      <div className="chips">
        {[['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly (date)'], ['custom', 'Every N days']].map(([x, l]) => <span key={x} className={`chip ${f.frequency === x ? 'on' : ''}`} onClick={() => upd('frequency', x)}>{l}</span>)}
      </div>
      {(f.frequency === 'daily' || f.frequency === 'weekly') && (
        <div className="field"><span>On</span><div className="chips">
          {days.map((d, i) => <span key={d} className={`chip ${f.weekdays.includes(i + 1) ? 'on' : ''}`} onClick={() => upd('weekdays', f.weekdays.includes(i + 1) ? f.weekdays.filter((x) => x !== i + 1) : [...f.weekdays, i + 1].sort())}>{d}</span>)}
        </div></div>
      )}
      {f.frequency === 'monthly' && <Field label="Every month on date (rent on 1st, vehicle service on 15th…)"><select value={f.month_day} onChange={(e) => upd('month_day', +e.target.value)}>{Array.from({ length: 31 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></Field>}
      {f.frequency === 'custom' && <Field label="Every N days"><input type="number" min={1} value={f.interval_days} onChange={(e) => upd('interval_days', +e.target.value)} /></Field>}
      {preview.length > 0 && <p className="muted">Next: {preview.map(dateOf).join(' · ')}</p>}
      <div className="grid g2">
        <Field label="Time — from"><input type="time" value={f.start_time} onChange={(e) => set('start_time', e.target.value)} /></Field>
        <Field label="Time — to (due)"><input type="time" value={f.due_time} onChange={(e) => set('due_time', e.target.value)} /></Field>
        <Field label="Start date"><input type="date" value={f.starts_on} onChange={(e) => set('starts_on', e.target.value)} /></Field>
        <Field label="End date (optional)"><input type="date" value={f.ends_on} onChange={(e) => set('ends_on', e.target.value)} /></Field>
        <Field label="Priority"><select value={f.priority} onChange={(e) => set('priority', e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
      </div>
      <Field label="Assign / rotate between (pick 2+ to alternate)">
        <div className="tools" style={{ maxHeight: 140, overflowY: 'auto' }}>
          {people.data?.map((p) => (
            <label key={p.id} className={f.rotation.includes(p.id) ? 'on' : ''} onClick={() => set('rotation', f.rotation.includes(p.id) ? f.rotation.filter((x) => x !== p.id) : [...f.rotation, p.id])}>{p.name}</label>
          ))}
        </div>
      </Field>
      <div className="field"><span>Checklist</span>
        {checklist.map((c, i) => <input key={i} className="input" style={{ marginBottom: 6 }} value={c} placeholder={`Step ${i + 1}`}
          onChange={(e) => { const n = [...checklist]; n[i] = e.target.value; setChecklist(i === n.length - 1 && e.target.value ? [...n, ''] : n); }} />)}
      </div>
      <div className="field"><span>Proof</span><div className="tools">
        {['photo', 'file', 'location', 'link'].map((p) => <label key={p} className={f.proof.includes(p) ? 'on' : ''} onClick={() => set('proof', f.proof.includes(p) ? f.proof.filter((x) => x !== p) : [...f.proof, p])}>{p}</label>)}
      </div></div>
      {(!f.title || !f.rotation.length) && <p className="field-err">{!f.title ? 'Write the task. ' : ''}{!f.rotation.length ? 'Pick who does it.' : ''}</p>}
      <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={!f.title || !f.rotation.length} onClick={save}>Save repeat</button>
    </Drawer>
  );
}
