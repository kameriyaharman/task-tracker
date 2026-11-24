import { useState } from 'react';
import { api, downloadUrl } from '../api';
import { useApi } from '../hooks';
import { dueLabel, timeOf, dateOf } from '../format';
import { Drawer, ErrorBox, Icon, Loading, Pri, TaskStatus } from '../ui';
import TaskForm from './TaskForm';

/** WhatsApp share link — opens WhatsApp with the task text for the assignee. */
export const waLink = (t: any) => {
  const num = String(t.assignee_mobile ?? '').replace(/\D/g, '');
  const to = num.length === 10 ? `91${num}` : num;
  const due = t.due_at ? `\nDue: ${dueLabel(t.due_at)} ${timeOf(t.due_at)}` : '';
  const steps = (t.checklist ?? []).length ? '\n' + t.checklist.map((c: any, i: number) => `${i + 1}. ${c.label}${c.assignee_name ? ` (${c.assignee_name.split(' ')[0]})` : ''}`).join('\n') : '';
  const text = `📋 *${t.title}*${t.description ? `\n${t.description}` : ''}${due}\nPriority: ${t.priority}${steps}${t.proof_type ? `\nProof needed: ${t.proof_type.replace(/,/g, ', ')}` : ''}`;
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
};

/** Complete-with-proof panel (photo / file / link / location) for the web admin. */
function CompleteBox({ t, onDone, onCancel }: { t: any; onDone: (x: any) => void; onCancel: () => void }) {
  const need: string[] = (t.proof_type ?? '').split(',').filter(Boolean);
  const [photos, setPhotos] = useState<File[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [link, setLink] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const getLoc = () => {
    setLocMsg('Getting location…');
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocMsg(null); },
      () => setLocMsg('Location blocked — allow location for this site in the browser'),
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const missing = [
    need.includes('photo') && !photos.length && 'photo',
    need.includes('file') && !files.length && 'file',
    need.includes('link') && !link.trim() && 'link',
    need.includes('location') && !loc && 'location',
  ].filter(Boolean) as string[];

  const submit = async () => {
    if (missing.length) return setErr(`Add ${missing.join(', ')} to complete this task`);
    setBusy(true); setErr(null);
    try {
      const fd = new FormData();
      photos.forEach((x) => fd.append('photo[]', x));
      files.forEach((x) => fd.append('file[]', x));
      if (link.trim()) fd.append('link', link.trim());
      if (remarks) fd.append('remarks', remarks);
      if (loc) { fd.append('lat', String(loc.lat)); fd.append('lng', String(loc.lng)); }
      onDone(await api(`/tasks/${t.id}/complete`, { body: fd }));
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const req = (k: string) => (need.includes(k) ? ' *' : ' (optional)');
  return (
    <div className="card complete-box">
      <h3>Complete task</h3>
      <ErrorBox msg={err} />
      <div className={`field${err && missing.includes('photo') ? ' invalid' : ''}`}><span>Photo{req('photo')}</span>
        <div className="attach-list">
          {photos.map((x, i) => <div key={i} className="attach-chip"><img src={URL.createObjectURL(x)} alt="" /><button type="button" className="link" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>✕</button></div>)}
          <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📷 {photos.length ? 'Add more' : 'Take / choose photo'}
            <input type="file" accept="image/*" multiple hidden onChange={(e) => { setPhotos([...photos, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} /></label>
        </div>
      </div>
      {(need.includes('file') || files.length > 0) && (
        <div className={`field${err && missing.includes('file') ? ' invalid' : ''}`}><span>File{req('file')}</span>
          <div className="attach-list">
            {files.map((x, i) => <div key={i} className="attach-chip"><Icon name="clip" size={13} /><span>{x.name}</span><button type="button" className="link" onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></div>)}
            <label className="btn ghost sm" style={{ cursor: 'pointer' }}>📄 Choose file
              <input type="file" multiple hidden accept=".pdf,.xlsx,.xls,.csv,.docx,image/*" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} /></label>
          </div>
        </div>
      )}
      {(need.includes('link') || link) && (
        <div className={`field${err && missing.includes('link') ? ' invalid' : ''}`}><span>Link{req('link')}</span>
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://instagram.com/p/…" /></div>
      )}
      {need.includes('location') && (
        <div className={`field${err && missing.includes('location') ? ' invalid' : ''}`}><span>Location *</span>
          {loc ? <span className="ok-text">📍 Captured ({loc.lat.toFixed(4)}, {loc.lng.toFixed(4)})</span> : <button type="button" className="btn ghost sm" onClick={getLoc}>📍 Capture my location</button>}
          {locMsg && <small className="muted" style={{ display: 'block', marginTop: 4 }}>{locMsg}</small>}
        </div>
      )}
      <div className="field"><span>Remarks</span><textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="What was done" /></div>
      <div className="row">
        <button className="btn ok" disabled={busy} onClick={submit}><Icon name="check" size={13} /> {busy ? 'Saving…' : 'Submit & complete'}</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export default function TaskDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data: t, error, setData } = useApi<any>(`/tasks/${id}`);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [step, setStep] = useState('');

  const act = async (path: string, body?: Record<string, unknown>, method = 'POST') => {
    setErr(null);
    try {
      setData(await api(path, { method, body: body ?? {} }));
      onChanged();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  if (editing && t) return <TaskForm task={t} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); onClose(); }} />;
  const open = t && t.status !== 'done' && t.status !== 'cancelled';
  const stepsLeft = t ? t.checklist.filter((c: any) => !+c.is_done).length : 0;

  return (
    <Drawer title="Task" onClose={onClose}>
      <ErrorBox msg={error || err} />
      {!t ? <Loading /> : (
        <div className="stack">
          <div className="row"><Pri p={t.priority} /> · <TaskStatus t={t} />{t.source !== 'manual' && <span className="badge">{t.source}</span>}</div>
          <h2 style={{ fontSize: 19, margin: 0 }}>{t.title}</h2>
          <div className="muted">{t.assignee_name} · by {t.assigner_name} · due {dueLabel(t.due_at)}</div>
          {t.description && <p style={{ margin: 0 }}>{t.description}</p>}
          {t.proof_type && <div className="muted">Proof needed: <b>{t.proof_type.split(',').join(' + ')}</b></div>}

          {(t.checklist.length > 0 || (open && t.can_manage)) && (
            <div className="card" style={{ padding: 12 }}>
              <h3>Checklist {t.checklist.length > 0 && `(${t.checklist.filter((c: any) => +c.is_done).length}/${t.checklist.length})`}</h3>
              {t.checklist.map((c: any, i: number) => (
                <label key={c.id} className={`check${c.locked ? ' locked' : ''}`} title={c.locked ? 'Finish the earlier steps first' : !c.can_tick ? `${c.assignee_name ?? t.assignee_name} has to tick this` : ''}>
                  <input type="checkbox" checked={!!+c.is_done} disabled={!c.can_tick} onChange={(e) => act(`/tasks/${t.id}/checklist/${c.id}`, { is_done: e.target.checked }, 'PATCH')} />
                  <span style={{ textDecoration: +c.is_done ? 'line-through' : 'none' }}>{i + 1}. {c.label}</span>
                  <small className="muted" style={{ marginLeft: 'auto' }}>
                    {+c.is_done ? `✓ ${c.done_by_name?.split(' ')[0] ?? ''} ${c.done_at ? timeOf(c.done_at) : ''}` : c.locked ? '🔒 ' : ''}
                    {!+c.is_done && (c.assignee_name ?? t.assignee_name)?.split(' ')[0]}
                  </small>
                </label>
              ))}
              {open && t.can_manage && (
                <div className="row" style={{ marginTop: 6 }}>
                  <input className="input" value={step} onChange={(e) => setStep(e.target.value)} placeholder="Add a step…"
                    onKeyDown={(e) => e.key === 'Enter' && step.trim() && act(`/tasks/${t.id}/checklist`, { label: step.trim() }).then(() => setStep(''))} />
                  <button className="btn ghost sm" disabled={!step.trim()} onClick={() => act(`/tasks/${t.id}/checklist`, { label: step.trim() }).then(() => setStep(''))}>Add</button>
                </div>
              )}
            </div>
          )}

          {t.attachments.length > 0 && (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Attachments & proof</div>
              <div className="attach-list">
                {t.attachments.map((a: any) => a.kind === 'voice' ? (
                  <div key={a.id} className="attach-chip voice"><span>🎤</span><audio controls preload="none" src={downloadUrl(`/files/${a.id}`)} /></div>
                ) : (
                  <a key={a.id} className="attach-chip" href={a.kind === 'link' ? a.file_name : downloadUrl(`/files/${a.id}`)} target="_blank" rel="noreferrer">
                    {a.kind === 'image' ? <img src={downloadUrl(`/files/${a.id}`)} alt="" /> : <span>{a.kind === 'link' ? '🔗' : '📄'}</span>}
                    <span>{a.kind === 'image' ? 'Photo' : a.file_name.length > 24 ? a.file_name.slice(0, 22) + '…' : a.file_name}{a.entity_type === 'task_proof' ? ' (proof)' : ''}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {t.status === 'done' && (
            <div className="card" style={{ padding: 12, background: '#f4fbf6' }}>
              <b>Completed</b> <span className="muted">{dateOf(t.completed_at)} {timeOf(t.completed_at)}{t.completion_place ? ` · 📍 ${t.completion_place}` : ''}</span>
              {t.completion_remarks && <p style={{ margin: '6px 0 0' }}>{t.completion_remarks}</p>}
              {t.can_manage && (
                <div className="row" style={{ marginTop: 8 }}>
                  <span className="muted">Rate:</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <span key={n} style={{ cursor: 'pointer', fontSize: 18, color: n <= (t.manager_rating ?? 0) ? '#f59e0b' : '#ddd' }}
                      onClick={() => act(`/tasks/${t.id}`, { manager_rating: n }, 'PATCH')}>★</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {completing && open && <CompleteBox t={t} onCancel={() => setCompleting(false)} onDone={(x) => { setData(x); setCompleting(false); onChanged(); }} />}

          {!completing && (
            <div className="row" style={{ flexWrap: 'wrap' }}>
              {open && t.status !== 'in_progress' && <button className="btn ghost sm" onClick={() => act(`/tasks/${t.id}/status`, { status: 'in_progress' })}>Start</button>}
              {open && (
                <button className="btn ok sm" onClick={() => (stepsLeft && !t.can_manage ? setErr(`Finish the checklist first (${stepsLeft} left)`) : t.proof_type ? setCompleting(true) : act(`/tasks/${t.id}/complete`))}>
                  <Icon name="check" size={13} /> {t.proof_type ? 'Complete with proof' : 'Mark complete'}
                </button>
              )}
              {open && !t.proof_type && <button className="btn ghost sm" onClick={() => setCompleting(true)}>Complete + photo</button>}
              {t.status === 'done' && t.can_manage && <button className="btn ghost sm" onClick={() => act(`/tasks/${t.id}/reopen`)}>Reopen</button>}
              <a className="btn ghost sm wa" href={waLink(t)} target="_blank" rel="noreferrer"><Icon name="whatsapp" size={13} /> WhatsApp</a>
              {t.can_manage && <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>}
              {t.can_manage && open && <button className="btn danger sm" onClick={() => confirm('Delete this task?') && api(`/tasks/${t.id}`, { method: 'DELETE' }).then(() => { onChanged(); onClose(); })}>Delete</button>}
            </div>
          )}

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Comments</div>
            {t.comments.map((c: any) => <div key={c.id} className="list-item"><b>{c.user_name.split(' ')[0]}:</b> {c.body}</div>)}
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…"
                onKeyDown={(e) => e.key === 'Enter' && comment && act(`/tasks/${t.id}/comments`, { body: comment }).then(() => setComment(''))} />
              <button className="btn sm" disabled={!comment} onClick={() => act(`/tasks/${t.id}/comments`, { body: comment }).then(() => setComment(''))}>Send</button>
            </div>
          </div>

          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>Activity</summary>
            {t.activity.map((a: any, i: number) => <div key={i} className="muted" style={{ padding: '4px 0' }}>{dateOf(a.created_at)} {timeOf(a.created_at)} · {a.user_name ?? 'System'} · {a.action.replace('status:', '→ ').replace('_', ' ')}</div>)}
          </details>
        </div>
      )}
    </Drawer>
  );
}
