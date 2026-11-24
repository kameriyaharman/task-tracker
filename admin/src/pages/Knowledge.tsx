import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { dateOf } from '../format';
import { Drawer, Empty, ErrorBox, Field, Icon, Loading } from '../ui';

/** Lessons learnt register — every mistake / complaint becomes a rule for next time. */
export default function Knowledge() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const { data, error, reload } = useApi<any>('/kb', { q, category: cat });
  const [edit, setEdit] = useState<any | null>(null);
  const count = (c: string) => data?.counts?.find((x: any) => x.category === c)?.n;

  return (
    <>
      <Topbar title="Knowledge base" action={<button className="btn" onClick={() => setEdit({})}><Icon name="plus" /> Add a lesson</button>} />
      <ErrorBox msg={error} />
      <p className="muted" style={{ marginTop: 0 }}>What we learnt from work and complaints — "next time do it this way". Anyone can add; search before starting a job.</p>
      <div className="task-search">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search lessons — concrete, leakage, wire…" />
      </div>
      <div className="chips">
        <span className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>All</span>
        {data?.categories.map((c: string) => <span key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}{count(c) ? <b>{count(c)}</b> : null}</span>)}
      </div>
      {!data ? <Loading /> : data.items.length ? (
        <div className="grid g2">
          {data.items.map((k: any) => (
            <div className="card kb-card" key={k.id} onClick={() => setEdit(k)} style={{ cursor: 'pointer' }}>
              <div className="between"><h4>{k.title}</h4><span className="badge">{k.category}</span></div>
              {k.problem && <div className="muted">Problem: {k.problem}</div>}
              <div className="lesson">✅ {k.lesson}</div>
              <div className="muted" style={{ fontSize: 11.5 }}>{k.created_by_name} · {dateOf(k.created_at)}{k.source_label ? ` · from ${k.source_type}: ${k.source_label}` : ''}{k.tags ? ` · #${k.tags.split(',').map((x: string) => x.trim()).join(' #')}` : ''}</div>
            </div>
          ))}
        </div>
      ) : <Empty>No lessons yet</Empty>}
      {edit && <KbForm k={edit} categories={data?.categories ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

export function KbForm({ k, categories, onClose, onSaved }: { k: any; categories: string[]; onClose: () => void; onSaved: () => void }) {
  const { me } = useAuth();
  const [f, setF] = useState({ title: k.title ?? '', problem: k.problem ?? '', lesson: k.lesson ?? '', category: k.category ?? 'Other', tags: k.tags ?? '', source_type: k.source_type ?? '', source_id: k.source_id ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (x: string, v: unknown) => setF((s) => ({ ...s, [x]: v }));
  const canEdit = !k.id || k.created_by === me?.id || me?.role !== 'employee';
  const save = async () => {
    if (!f.title.trim() || !f.lesson.trim()) return setErr('Write a title and the lesson');
    try { await api(k.id ? `/kb/${k.id}` : '/kb', { method: k.id ? 'PATCH' : 'POST', body: f }); onSaved(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Drawer title={k.id ? 'Lesson' : 'Add a lesson'} onClose={onClose}>
      <ErrorBox msg={err} />
      <Field label="Title *"><input value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Seal joints before pouring concrete" disabled={!canEdit} /></Field>
      <Field label="What went wrong / situation"><textarea rows={2} value={f.problem} onChange={(e) => set('problem', e.target.value)} disabled={!canEdit} /></Field>
      <Field label="Lesson — what to do next time *"><textarea rows={3} value={f.lesson} onChange={(e) => set('lesson', e.target.value)} disabled={!canEdit} /></Field>
      <div className="grid g2">
        <Field label="Category"><select value={f.category} onChange={(e) => set('category', e.target.value)} disabled={!canEdit}>{(categories.length ? categories : ['Other']).map((c) => <option key={c}>{c}</option>)}</select></Field>
        <Field label="Tags (comma separated)"><input value={f.tags} onChange={(e) => set('tags', e.target.value)} placeholder="concrete, leakage" disabled={!canEdit} /></Field>
      </div>
      {canEdit && (
        <div className="row">
          <button className="btn" onClick={save}>Save</button>
          {k.id && <button className="btn danger" onClick={() => confirm('Delete this lesson?') && api(`/kb/${k.id}`, { method: 'DELETE' }).then(onSaved)}>Delete</button>}
        </div>
      )}
    </Drawer>
  );
}
