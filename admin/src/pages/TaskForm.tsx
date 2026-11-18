import { useState } from 'react';
import { api } from '../api';
import { useApi } from '../hooks';
import { toLocalInput } from '../format';
import { Drawer, ErrorBox, Field, Icon } from '../ui';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Delegate a task" drawer — checklist, attachments, voice note, WhatsApp, repeat, reminder. */
export default function TaskForm({ onClose, onSaved, task }: { onClose: () => void; onSaved: () => void; task?: any }) {
  const people = useApi<any[]>('/employees');
  const depts = useApi<any[]>('/departments');
  const goals = useApi<any[]>('/goals');
  const due = new Date();
  due.setHours(18, 0, 0, 0);

  const [f, setF] = useState({
    title: task?.title ?? '', description: task?.description ?? '', assigned_to: task?.assigned_to ?? '',
    department_id: task?.department_id ?? '', goal_id: task?.goal_id ?? '',
    due_at: task?.due_at ? task.due_at.slice(0, 16).replace(' ', 'T') : toLocalInput(due),
    priority: task?.priority ?? 'medium', remind_before_min: task?.remind_before_min ?? 60, send_whatsapp: task ? !!task.send_whatsapp : true,
    proof: (task?.proof_type ?? '').split(',').filter(Boolean) as string[],
  });
  const [repeat, setRepeat] = useState({ frequency: 'none', weekdays: [1, 2, 3, 4, 5, 6] as number[], month_day: 1 });
  const [checklist, setChecklist] = useState<string[]>([]);
  const [showChecklist, setShowChecklist] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [voice, setVoice] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        ...f, proof_type: f.proof.join(','), due_at: f.due_at.replace('T', ' ') + ':00',
        department_id: f.department_id || null, goal_id: f.goal_id || null,
      };
      if (task) {
        await api(`/tasks/${task.id}`, { method: 'PATCH', body });
      } else {
        const fd = new FormData();
        Object.entries(body).forEach(([k, v]) => k !== 'proof' && v !== null && fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)));
        fd.append('checklist', JSON.stringify(checklist.filter(Boolean)));
        if (repeat.frequency !== 'none') fd.append('repeat', JSON.stringify(repeat));
        files.forEach((x) => fd.append('attachments[]', x));
        if (voice) fd.append('voice_note', voice);
        await api('/tasks', { body: fd });
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleProof = (p: string) => set('proof', f.proof.includes(p) ? f.proof.filter((x) => x !== p) : [...f.proof, p]);

  return (
    <Drawer title={task ? 'Edit task' : 'Delegate a task'} onClose={onClose}>
      <ErrorBox msg={err} />
      {!task && (
        <div className="tools">
          <label className={showChecklist ? 'on' : ''} onClick={() => { setShowChecklist(!showChecklist); if (!checklist.length) setChecklist(['']); }}><Icon name="check" size={12} /> Checklist</label>
          <label className={files.length ? 'on' : ''}><Icon name="clip" size={12} /> Attach{files.length ? ` (${files.length})` : ''}
            <input type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></label>
          <label className={voice ? 'on' : ''}><Icon name="mic" size={12} /> Voice note
            <input type="file" accept="audio/*" hidden onChange={(e) => setVoice(e.target.files?.[0] ?? null)} /></label>
          <label className={f.send_whatsapp ? 'on' : ''} onClick={() => set('send_whatsapp', !f.send_whatsapp)}><Icon name="whatsapp" size={12} /> WhatsApp</label>
        </div>
      )}
      <Field label="Task"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Prepare quotation for Mehta Builders" autoFocus /></Field>
      <Field label="Details (optional)"><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
      {showChecklist && (
        <div className="field"><span>Checklist</span>
          {checklist.map((c, i) => (
            <input key={i} className="input" style={{ marginBottom: 6 }} value={c} placeholder={`Item ${i + 1}`}
              onChange={(e) => { const n = [...checklist]; n[i] = e.target.value; setChecklist(i === n.length - 1 && e.target.value ? [...n, ''] : n); }} />
          ))}
        </div>
      )}
      <div className="grid g2">
        <Field label="Assign to">
          <select value={f.assigned_to} onChange={(e) => {
            const p = people.data?.find((x) => String(x.id) === e.target.value);
            setF((s) => ({ ...s, assigned_to: e.target.value, department_id: p?.department_id ?? s.department_id }));
          }}>
            <option value="">Choose…</option>
            {people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}{p.department_name ? ` (${p.department_name})` : ''}</option>)}
          </select>
        </Field>
        <Field label="Department">
          <select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}>
            <option value="">—</option>
            {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Due"><input type="datetime-local" value={f.due_at} onChange={(e) => set('due_at', e.target.value)} /></Field>
        <Field label="Priority">
          <select value={f.priority} onChange={(e) => set('priority', e.target.value)}>
            <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
          </select>
        </Field>
        {!task && (
          <Field label="Repeat">
            <select value={repeat.frequency} onChange={(e) => setRepeat({ ...repeat, frequency: e.target.value })}>
              <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option>
            </select>
          </Field>
        )}
        <Field label="Reminder">
          <select value={f.remind_before_min ?? ''} onChange={(e) => set('remind_before_min', e.target.value ? Number(e.target.value) : null)}>
            <option value="">No reminder</option><option value="15">15 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option>
          </select>
        </Field>
      </div>
      {(repeat.frequency === 'weekly' || repeat.frequency === 'daily') && (
        <div className="chips">
          {days.map((d, i) => (
            <span key={d} className={`chip ${repeat.weekdays.includes(i + 1) ? 'on' : ''}`}
              onClick={() => setRepeat({ ...repeat, weekdays: repeat.weekdays.includes(i + 1) ? repeat.weekdays.filter((x) => x !== i + 1) : [...repeat.weekdays, i + 1].sort() })}>{d}</span>
          ))}
        </div>
      )}
      {repeat.frequency === 'monthly' && <Field label="Day of month"><input type="number" min={1} max={31} value={repeat.month_day} onChange={(e) => setRepeat({ ...repeat, month_day: Number(e.target.value) })} /></Field>}
      <Field label="Link to goal (optional)">
        <select value={f.goal_id} onChange={(e) => set('goal_id', e.target.value)}>
          <option value="">—</option>
          {goals.data?.flatMap((g) => [g, ...(g.children ?? [])]).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </Field>
      <div className="field"><span>Proof required to complete</span>
        <div className="tools">
          {['photo', 'file', 'location', 'link'].map((p) => <label key={p} className={f.proof.includes(p) ? 'on' : ''} onClick={() => toggleProof(p)}>{p}</label>)}
        </div>
      </div>
      <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy || !f.title || !f.assigned_to} onClick={save}>
        {busy ? 'Saving…' : task ? 'Save changes' : 'Assign'}
      </button>
    </Drawer>
  );
}
