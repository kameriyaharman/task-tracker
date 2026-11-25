import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { useApi } from '../hooks';
import { toLocalInput } from '../format';
import { Drawer, ErrorBox, Icon } from '../ui';
import { useRecorder, mmss } from '../voice';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PRI: [string, string][] = [['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['urgent', 'Urgent']];
type Step = { label: string; assigned_to: string };

const plusHours = (h: number) => { const d = new Date(Date.now() + h * 3600e3); d.setSeconds(0, 0); return toLocalInput(d); };
const todayAt = (h: number, addDays = 0) => { const d = new Date(); d.setDate(d.getDate() + addDays); d.setHours(h, 0, 0, 0); return toLocalInput(d); };

/** Field wrapper that turns red with a message when invalid. Uses a div so it can hold several inputs. */
function F({ label, error, children, id }: { label: string; error?: string; children: React.ReactNode; id?: string }) {
  return (
    <div className={`field${error ? ' invalid' : ''}`} id={id}>
      <span>{label}</span>
      {children}
      {error && <small className="field-err">{error}</small>}
    </div>
  );
}

const ord = (n: number) => n + ([11, 12, 13].includes(n % 100) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

/** "Delegate a task" drawer — template, voice note, checklist with owners, attachments, multiple assignees, repeat, proof. */
export default function TaskForm({ onClose, onSaved, task }: { onClose: () => void; onSaved: () => void; task?: any }) {
  const { me } = useAuth();
  const people = useApi<any[]>('/employees');
  const depts = useApi<any[]>('/departments');
  const goals = useApi<any[]>('/goals');
  const templates = useApi<any[]>(task ? null : '/task-templates');
  const defaults = useApi<{ default_due_hours: number }>(task ? null : '/task-defaults');
  const manager = me?.role === 'owner' || me?.role === 'manager';

  const [f, setF] = useState({
    title: task?.title ?? '', description: task?.description ?? '',
    department_id: task?.department_id ? String(task.department_id) : '', goal_id: task?.goal_id ?? '',
    due_at: task?.due_at ? task.due_at.slice(0, 16).replace(' ', 'T') : plusHours(4),
    priority: task?.priority ?? 'medium', remind_before_min: task?.remind_before_min ?? 60, send_whatsapp: task ? !!task.send_whatsapp : true,
    proof: (task?.proof_type ?? '').split(',').filter(Boolean) as string[],
  });
  const [assignees, setAssignees] = useState<string[]>(task ? [String(task.assigned_to)] : []);
  const [repeat, setRepeat] = useState({ frequency: 'none', weekdays: [1, 2, 3, 4, 5, 6] as number[], month_day: 1, starts_on: '', ends_on: '', start_time: '', due_time: '18:00' });
  const [steps, setSteps] = useState<Step[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saveTpl, setSaveTpl] = useState(false);
  const [emergency, setEmergency] = useState(false);
  const [tplCode, setTplCode] = useState('');
  const voice = useRecorder();
  const [err, setErr] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [dueTouched, setDueTouched] = useState(!!task);
  const set = (k: string, v: unknown) => { setF((s) => ({ ...s, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  // default due window from settings (4 h unless changed)
  useEffect(() => { if (!dueTouched && defaults.data) setF((s) => ({ ...s, due_at: plusHours(defaults.data!.default_due_hours) })); }, [defaults.data]); // eslint-disable-line

  const visiblePeople = useMemo(() => (people.data ?? []).filter((p) => !f.department_id || String(p.department_id) === f.department_id), [people.data, f.department_id]);
  const nameOf = (id: string) => people.data?.find((p) => String(p.id) === id)?.name ?? '';
  const togglePerson = (id: string) => {
    setErrors((e) => ({ ...e, assigned_to: '' }));
    if (task) return setAssignees([id]);
    setAssignees((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  };

  const useTemplate = (id: string) => {
    const t = templates.data?.find((x) => String(x.id) === id);
    if (!t) return;
    setF((s) => ({ ...s, title: t.title, description: t.description ?? '', department_id: t.department_id ? String(t.department_id) : s.department_id,
      priority: t.priority, proof: (t.proof_type ?? '').split(',').filter(Boolean), due_at: t.due_hours ? plusHours(t.due_hours) : s.due_at }));
    setSteps((t.checklist ?? []).map((c: any) => (typeof c === 'string' ? { label: c, assigned_to: '' } : { label: c.label, assigned_to: c.assigned_to ? String(c.assigned_to) : '' })));
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (f.title.trim().length < 2) e.title = 'Write what has to be done';
    if (!assignees.length) e.assigned_to = 'Choose at least one person';
    if (!f.due_at) e.due_at = 'Choose a due date & time';
    else if (!task && new Date(f.due_at) < new Date(Date.now() - 60e3) && repeat.frequency === 'none') e.due_at = 'Due time is in the past';
    if (repeat.frequency === 'weekly' && !repeat.weekdays.length) e.repeat = 'Pick at least one day';
    if (repeat.frequency === 'monthly' && (repeat.month_day < 1 || repeat.month_day > 31)) e.repeat = 'Date must be 1–31';
    if (repeat.starts_on && repeat.ends_on && repeat.ends_on < repeat.starts_on) e.repeat = 'End date is before start date';
    if (repeat.start_time && repeat.due_time && repeat.due_time <= repeat.start_time) e.repeat = '"To" time must be after "From" time';
    if (voice.recording) e.voice = 'Stop the recording first';
    if (saveTpl && !f.title.trim()) e.title = 'Write the task';
    setErrors(e);
    if (Object.keys(e).length) {
      setErr('Please fill the fields marked in red');
      setTimeout(() => document.querySelector('.drawer .field.invalid')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return false;
    }
    return true;
  };

  const save = async () => {
    setErr(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const checklist = steps.filter((s) => s.label.trim()).map((s) => ({ label: s.label.trim(), assigned_to: s.assigned_to ? +s.assigned_to : null }));
      const body: Record<string, any> = {
        title: f.title.trim(), description: f.description, priority: f.priority, remind_before_min: f.remind_before_min, send_whatsapp: f.send_whatsapp,
        proof_type: f.proof.join(','), due_at: f.due_at.replace('T', ' ') + ':00',
        department_id: assignees.length > 1 ? null : f.department_id || null, goal_id: f.goal_id || null,
      };
      if (task) {
        await api(`/tasks/${task.id}`, { method: 'PATCH', body: { ...body, assigned_to: +assignees[0] } });
      } else {
        const fd = new FormData();
        Object.entries(body).forEach(([k, v]) => v !== null && v !== undefined && fd.append(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v)));
        fd.append('assignees', JSON.stringify(assignees.map(Number)));
        if (emergency) fd.append('is_emergency', '1');
        fd.append('checklist', JSON.stringify(checklist));
        if (repeat.frequency !== 'none') fd.append('repeat', JSON.stringify({ ...repeat, starts_on: repeat.starts_on || null, ends_on: repeat.ends_on || null, start_time: repeat.start_time || null }));
        files.forEach((x) => fd.append('attachments[]', x));
        if (voice.blob) { fd.append('voice_note', voice.blob); fd.append('voice_duration', String(voice.secs)); }
        const r = await api<any>('/tasks', { body: fd });
        if (r.needs_approval) alert(`Sent to ${r.approver_name} for approval. The task reaches ${assignees.length > 1 ? 'them' : nameOf(assignees[0])} once approved.`);
        if (saveTpl) {
          await api('/task-templates', { body: { code: tplCode, title: body.title, description: body.description, department_id: body.department_id, priority: body.priority, proof_type: body.proof_type, checklist } }).catch(() => {});
        }
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggleProof = (p: string) => set('proof', f.proof.includes(p) ? f.proof.filter((x) => x !== p) : [...f.proof, p]);
  const setStep = (i: number, k: keyof Step, v: string) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  return (
    <Drawer title={task ? 'Edit task' : 'Delegate a task'} onClose={onClose}>
      <ErrorBox msg={err} />

      {!task && !!templates.data?.length && (
        <F label="Start from a template (optional)">
          <select value="" onChange={(e) => useTemplate(e.target.value)}>
            <option value="">Choose a standard task…</option>
            {templates.data.map((t) => <option key={t.id} value={t.id}>{t.code} — {t.title}</option>)}
          </select>
        </F>
      )}

      <F label="Task *" error={errors.title}>
        <div className="row" style={{ gap: 6, alignItems: 'stretch' }}>
          <input style={{ flex: 1 }} value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Collect bill from UltraTech dealer" autoFocus />
          {!task && (
            <button type="button" className={`btn sm ${voice.recording ? 'danger' : 'ghost'}`} title="Record a voice note (explain in Hindi)" onClick={() => (voice.recording ? voice.stop() : voice.start())}>
              <Icon name="mic" size={14} /> {voice.recording ? `Stop ${mmss(voice.secs)}` : 'Voice'}
            </button>
          )}
        </div>
      </F>
      {(voice.blob || voice.err || errors.voice) && (
        <div className="voice-row">
          {voice.blob && <><audio controls src={URL.createObjectURL(voice.blob)} /><span className="muted">{mmss(voice.secs)}</span><button type="button" className="link" onClick={voice.clear}>Remove</button></>}
          {(voice.err || errors.voice) && <small className="field-err">{voice.err || errors.voice}</small>}
        </div>
      )}

      <F label="Details (optional)"><textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} /></F>

      {/* Checklist sits right under the task — each step can go to a different person, done in order */}
      <div className="field">
        <span>Checklist {steps.length > 0 && <em className="muted">— steps are done in order; give a step to someone else if needed</em>}</span>
        {steps.map((s, i) => (
          <div key={i} className="step-row">
            <b>{i + 1}.</b>
            <input className="input" value={s.label} placeholder={i === 0 ? 'Collect the bill' : i === 1 ? 'Bill received' : 'Entry in Tally'} onChange={(e) => setStep(i, 'label', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setSteps([...steps, { label: '', assigned_to: '' }]); } }} autoFocus={i === steps.length - 1 && !s.label} />
            <select className="input" value={s.assigned_to} onChange={(e) => setStep(i, 'assigned_to', e.target.value)} title="Who does this step">
              <option value="">Same person</option>
              {people.data?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" className="link" onClick={() => setSteps(steps.filter((_, j) => j !== i))} title="Remove">✕</button>
          </div>
        ))}
        <button type="button" className="btn ghost sm" onClick={() => setSteps([...steps, { label: '', assigned_to: '' }])}><Icon name="plus" size={12} /> Add checklist item</button>
      </div>

      {!task && (
        <div className="field">
          <span>Attachments (photos, PDF, Excel…)</span>
          <div className="attach-list">
            {files.map((x, i) => (
              <div key={i} className="attach-chip">
                {x.type.startsWith('image/') ? <img src={URL.createObjectURL(x)} alt="" /> : <Icon name="clip" size={14} />}
                <span>{x.name.length > 22 ? x.name.slice(0, 20) + '…' : x.name}</span>
                <button type="button" className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <label className="btn ghost sm" style={{ cursor: 'pointer' }}><Icon name="clip" size={12} /> {files.length ? 'Add more' : 'Attach file / photo'}
              <input type="file" multiple hidden accept="image/*,.pdf,.xlsx,.xls,.csv,.docx" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      )}

      <F label="Department">
        <select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}>
          <option value="">All departments</option>
          {depts.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </F>
      <F label={task ? 'Assign to *' : 'Assign to * (tick one or more people)'} error={errors.assigned_to} id="f-assign">
        {assignees.length > 0 && (
          <div className="chips" style={{ marginBottom: 6 }}>
            {assignees.map((id) => <span key={id} className="chip on" onClick={() => togglePerson(id)}>{nameOf(id)} ✕</span>)}
          </div>
        )}
        {!task && f.department_id && visiblePeople.length > 1 && (
          <div className="row" style={{ marginBottom: 6, flexWrap: 'wrap' }}>
            <button type="button" className="btn ghost sm" onClick={() => setAssignees(Array.from(new Set([...assignees, ...visiblePeople.map((p) => String(p.id))])))}>Select everyone in this department</button>
          </div>
        )}
        <div className="people-pick">
          {visiblePeople.map((p) => (
            <label key={p.id} className={assignees.includes(String(p.id)) ? 'on' : ''}>
              <input type={task ? 'radio' : 'checkbox'} checked={assignees.includes(String(p.id))} onChange={() => togglePerson(String(p.id))} />
              {p.name}{p.id === me?.id ? ' (me)' : ''}<small>{p.department_name ?? ''}</small>
            </label>
          ))}
          {!visiblePeople.length && <span className="muted">No one in this department</span>}
        </div>
      </F>

      <div className="grid g2">
        <F label="Due *" error={errors.due_at}>
          <input type="datetime-local" value={f.due_at} onChange={(e) => { setDueTouched(true); set('due_at', e.target.value); }} />
          <div className="chips" style={{ margin: '6px 0 0' }}>
            {[['+4 h', plusHours(4)], ['Today 6 PM', todayAt(18)], ['Tomorrow 11 AM', todayAt(11, 1)]].map(([l, v]) => (
              <span key={l} className="chip sm" onClick={() => { setDueTouched(true); set('due_at', v); }}>{l}</span>
            ))}
          </div>
        </F>
        <F label="Priority">
          <div className="seg pri-seg">
            {PRI.map(([v, l]) => <button type="button" key={v} className={`${f.priority === v ? 'on' : ''} p-${v}`} onClick={() => set('priority', v)}>{l}</button>)}
          </div>
        </F>
        {!task && (
          <F label="Repeat">
            <select value={repeat.frequency} onChange={(e) => setRepeat({ ...repeat, frequency: e.target.value })}>
              <option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly (fixed date)</option>
            </select>
          </F>
        )}
        <F label="Reminder">
          <select value={f.remind_before_min ?? ''} onChange={(e) => set('remind_before_min', e.target.value ? Number(e.target.value) : null)}>
            <option value="">No reminder</option><option value="15">15 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option>
          </select>
        </F>
      </div>

      {repeat.frequency !== 'none' && (
        <div className={`repeat-box${errors.repeat ? ' invalid' : ''}`}>
          {(repeat.frequency === 'weekly' || repeat.frequency === 'daily') && (
            <div className="chips">
              {days.map((d, i) => (
                <span key={d} className={`chip ${repeat.weekdays.includes(i + 1) ? 'on' : ''}`}
                  onClick={() => setRepeat({ ...repeat, weekdays: repeat.weekdays.includes(i + 1) ? repeat.weekdays.filter((x) => x !== i + 1) : [...repeat.weekdays, i + 1].sort() })}>{d}</span>
              ))}
            </div>
          )}
          {repeat.frequency === 'monthly' && (
            <F label="Every month on date (e.g. rent on 1st, service on 15th)">
              <select value={repeat.month_day} onChange={(e) => setRepeat({ ...repeat, month_day: +e.target.value })}>
                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{ord(i + 1)} of every month</option>)}
              </select>
            </F>
          )}
          <div className="grid g2">
            <F label="Time — from"><input type="time" value={repeat.start_time} onChange={(e) => setRepeat({ ...repeat, start_time: e.target.value })} /></F>
            <F label="Time — to (due)"><input type="time" value={repeat.due_time} onChange={(e) => setRepeat({ ...repeat, due_time: e.target.value })} /></F>
            <F label="Start date"><input type="date" value={repeat.starts_on} onChange={(e) => setRepeat({ ...repeat, starts_on: e.target.value })} /></F>
            <F label="End date (optional)"><input type="date" value={repeat.ends_on} onChange={(e) => setRepeat({ ...repeat, ends_on: e.target.value })} /></F>
          </div>
          {errors.repeat && <small className="field-err">{errors.repeat}</small>}
        </div>
      )}

      <F label="Link to goal (optional)">
        <select value={f.goal_id} onChange={(e) => set('goal_id', e.target.value)}>
          <option value="">—</option>
          {goals.data?.flatMap((g) => [g, ...(g.children ?? [])]).map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
      </F>
      <div className="field"><span>Proof required to complete</span>
        <div className="tools">
          {[['photo', '📷 Photo'], ['file', '📄 File'], ['location', '📍 Location'], ['link', '🔗 Link']].map(([p, l]) => (
            <label key={p} className={f.proof.includes(p) ? 'on' : ''}><input type="checkbox" hidden checked={f.proof.includes(p)} onChange={() => toggleProof(p)} />{l}</label>
          ))}
        </div>
      </div>

      {!task && (
        <label className={`switch-row${emergency ? ' emergency' : ''}`}>
          <input type="checkbox" checked={emergency} onChange={(e) => { setEmergency(e.target.checked); if (e.target.checked) { set('priority', 'urgent'); if (f.department_id) setAssignees(visiblePeople.map((p) => String(p.id))); } }} />
          <span>🚨 Emergency task {emergency ? <b>— urgent alert to {assignees.length || 'the selected'} people</b> : <span className="muted">(e.g. inspection tomorrow, documents not ready)</span>}</span>
        </label>
      )}
      <label className="switch-row">
        <input type="checkbox" checked={f.send_whatsapp} onChange={(e) => set('send_whatsapp', e.target.checked)} />
        <span><Icon name="whatsapp" size={13} /> Send this task on WhatsApp {f.send_whatsapp ? <b className="ok-text">ON</b> : <b className="muted">OFF</b>}</span>
      </label>
      {!task && manager && (
        <label className="switch-row">
          <input type="checkbox" checked={saveTpl} onChange={(e) => setSaveTpl(e.target.checked)} />
          <span>Also save as a template</span>
          {saveTpl && <input className="input" style={{ width: 110, marginLeft: 'auto' }} placeholder="Code (auto)" value={tplCode} onChange={(e) => setTplCode(e.target.value.toUpperCase())} />}
        </label>
      )}

      <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} disabled={busy} onClick={save}>
        {busy ? 'Saving…' : task ? 'Save changes' : `${emergency ? '🚨 ' : ''}${!manager && assignees.some((a) => +a !== me?.id) ? 'Send for approval' : assignees.length > 1 ? `Assign to ${assignees.length} people` : 'Assign'}`}
      </button>
    </Drawer>
  );
}
