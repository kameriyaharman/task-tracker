import { useState } from 'react';
import { api, downloadUrl } from '../api';
import { useApi } from '../hooks';
import { dueLabel, timeOf, dateOf } from '../format';
import { Drawer, ErrorBox, Icon, Loading, Pri, TaskStatus } from '../ui';
import TaskForm from './TaskForm';

export default function TaskDetail({ id, onClose, onChanged }: { id: number; onClose: () => void; onChanged: () => void }) {
  const { data: t, error, setData } = useApi<any>(`/tasks/${id}`);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

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

  return (
    <Drawer title="Task" onClose={onClose}>
      <ErrorBox msg={error || err} />
      {!t ? <Loading /> : (
        <div className="stack">
          <div className="row"><Pri p={t.priority} /> · <TaskStatus t={t} />{t.source !== 'manual' && <span className="badge">{t.source}</span>}</div>
          <h2 style={{ fontSize: 19, margin: 0 }}>{t.title}</h2>
          <div className="muted">{t.assignee_name} · by {t.assigner_name} · due {dueLabel(t.due_at)} {t.due_at && timeOf(t.due_at)}</div>
          {t.description && <p style={{ margin: 0 }}>{t.description}</p>}

          {t.checklist.length > 0 && (
            <div className="card" style={{ padding: 12 }}>
              <h3>Checklist ({t.checklist.filter((c: any) => +c.is_done).length}/{t.checklist.length})</h3>
              {t.checklist.map((c: any) => (
                <label key={c.id} className="check">
                  <input type="checkbox" checked={!!+c.is_done} onChange={(e) => act(`/tasks/${t.id}/checklist/${c.id}`, { is_done: e.target.checked }, 'PATCH')} />
                  <span style={{ textDecoration: +c.is_done ? 'line-through' : 'none' }}>{c.label}</span>
                </label>
              ))}
            </div>
          )}

          {t.attachments.length > 0 && (
            <div>
              <div className="muted" style={{ marginBottom: 6 }}>Attachments & proof</div>
              <div className="tools">
                {t.attachments.map((a: any) => (
                  <a key={a.id} className="badge" href={downloadUrl(`/files/${a.id}`)} target="_blank" rel="noreferrer">
                    {a.kind === 'voice' ? '🎤' : a.kind === 'image' ? '🖼' : a.kind === 'link' ? '🔗' : '📄'} {a.file_name}{a.entity_type === 'task_proof' ? ' (proof)' : ''}
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

          <div>
            <div className="muted" style={{ marginBottom: 6 }}>Comments</div>
            {t.comments.map((c: any) => <div key={c.id} className="list-item"><b>{c.user_name.split(' ')[0]}:</b> {c.body}</div>)}
            <div className="row" style={{ marginTop: 8 }}>
              <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…"
                onKeyDown={(e) => e.key === 'Enter' && comment && act(`/tasks/${t.id}/comments`, { body: comment }).then(() => setComment(''))} />
              <button className="btn sm" disabled={!comment} onClick={() => act(`/tasks/${t.id}/comments`, { body: comment }).then(() => setComment(''))}>Send</button>
            </div>
          </div>

          <div className="row" style={{ flexWrap: 'wrap' }}>
            {t.status !== 'done' && t.status !== 'in_progress' && <button className="btn ghost sm" onClick={() => act(`/tasks/${t.id}/status`, { status: 'in_progress' })}>Start</button>}
            {t.status !== 'done' && !t.proof_type && <button className="btn ok sm" onClick={() => act(`/tasks/${t.id}/complete`)}><Icon name="check" size={13} /> Mark complete</button>}
            {t.status === 'done' && t.can_manage && <button className="btn ghost sm" onClick={() => act(`/tasks/${t.id}/reopen`)}>Reopen</button>}
            {t.can_manage && <button className="btn ghost sm" onClick={() => setEditing(true)}>Edit</button>}
            {t.can_manage && t.status !== 'done' && <button className="btn danger sm" onClick={() => confirm('Delete this task?') && api(`/tasks/${t.id}`, { method: 'DELETE' }).then(() => { onChanged(); onClose(); })}>Delete</button>}
          </div>
          {t.proof_type && t.status !== 'done' && <p className="muted">Needs {t.proof_type.replace(',', ' + ')} proof — completed from the mobile app.</p>}

          <details>
            <summary className="muted" style={{ cursor: 'pointer' }}>Activity</summary>
            {t.activity.map((a: any, i: number) => <div key={i} className="muted" style={{ padding: '4px 0' }}>{dateOf(a.created_at)} {timeOf(a.created_at)} · {a.user_name ?? 'System'} · {a.action.replace('status:', '→ ').replace('_', ' ')}</div>)}
          </details>
        </div>
      )}
    </Drawer>
  );
}
