import { DateInput } from '../dateinput';
import { Select } from '../erp/common';
import { useState } from 'react';
import { api } from '../api';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { dateOf } from '../format';
import { Avatar, Badge, Drawer, ErrorBox, Field, Icon, Loading } from '../ui';

const stages: [string, string][] = [['idea', 'Ideas'], ['production', 'In production'], ['scheduled', 'Scheduled'], ['live', 'Live / done']];

export default function Campaigns() {
  const { data, error, reload } = useApi<Record<string, any[]>>('/campaigns');
  const [edit, setEdit] = useState<any | null>(null);
  const [drag, setDrag] = useState<any | null>(null);

  const move = async (c: any, stage: string) => {
    if (c.stage === stage) return;
    await api(`/campaigns/${c.id}`, { method: 'PATCH', body: { stage } });
    reload();
  };

  return (
    <>
      <Topbar title="Content & campaigns" action={<button className="btn" onClick={() => setEdit({ stage: 'idea' })}><Icon name="plus" /> New campaign</button>} />
      <ErrorBox msg={error} />
      {!data ? <Loading /> : (
        <div className="board">
          {stages.map(([s, label]) => (
            <div className="col" key={s} onDragOver={(e) => e.preventDefault()} onDrop={() => drag && move(drag, s)}>
              <h4>{label} <span className="muted">{data[s].length}</span></h4>
              {data[s].map((c) => (
                <div key={c.id} className="bcard" draggable onDragStart={() => setDrag(c)} onClick={() => setEdit(c)}>
                  <b>{c.title}</b>
                  <div className="muted" style={{ marginBottom: 6 }}>
                    {c.channel}{c.go_live_on && s !== 'idea' && s !== 'live' ? ` · ${dateOf(c.go_live_on)}` : ''}
                    {s === 'live' && c.reach ? ` · Reach ${(c.reach / 1000).toFixed(0)}k · ${c.leads} leads` : ''}
                  </div>
                  <div className="between">
                    {c.owner_name ? <Avatar name={c.owner_name} /> : <span />}
                    <Badge s={s === 'live' ? 'done' : s}>{c.sub_status || (s === 'live' ? 'Done' : s === 'idea' ? 'Idea' : s[0].toUpperCase() + s.slice(1))}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
      {edit && <CampaignForm c={edit} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
    </>
  );
}

function CampaignForm({ c, onClose, onSaved }: { c: any; onClose: () => void; onSaved: () => void }) {
  const people = useApi<any[]>('/employees');
  const [f, setF] = useState({ title: c.title ?? '', channel: c.channel ?? 'Instagram', owner_id: c.owner_id ?? '', stage: c.stage, sub_status: c.sub_status ?? '', go_live_on: c.go_live_on ?? '', reach: c.reach ?? '', leads: c.leads ?? '', notes: c.notes ?? '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    const body = { ...f, owner_id: f.owner_id || null, go_live_on: f.go_live_on || null, reach: f.reach || null, leads: f.leads || null };
    try {
      if (c.id) await api(`/campaigns/${c.id}`, { method: 'PATCH', body }); else await api('/campaigns', { body });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Drawer title={c.id ? 'Campaign' : 'New campaign'} onClose={onClose}>
      <ErrorBox msg={err} />
      <Field label="Title"><input value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
      <div className="grid g2">
        <Field label="Channel"><select value={f.channel} onChange={(e) => set('channel', e.target.value)}>{['Instagram', 'Facebook', 'YouTube', 'WhatsApp', 'Email', 'Website', 'Print'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <Field label="Owner"><Select value={f.owner_id} onChange={(v) => set('owner_id', v)} options={people.data ?? []} /></Field>
        <Field label="Stage"><select value={f.stage} onChange={(e) => set('stage', e.target.value)}>{stages.map(([s, l]) => <option key={s} value={s}>{l}</option>)}</select></Field>
        <Field label="Sub-status"><input value={f.sub_status} onChange={(e) => set('sub_status', e.target.value)} placeholder="Draft, Editing…" /></Field>
        <Field label="Go-live date"><DateInput value={f.go_live_on} onChange={(e) => set('go_live_on', e.target.value)} /></Field>
        <div />
        <Field label="Reach"><input type="number" value={f.reach} onChange={(e) => set('reach', e.target.value)} /></Field>
        <Field label="Leads"><input type="number" value={f.leads} onChange={(e) => set('leads', e.target.value)} /></Field>
      </div>
      <Field label="Notes"><textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></Field>
      <div className="row">
        <button className="btn" disabled={!f.title} onClick={save}>Save</button>
        {c.id && <button className="btn danger" onClick={() => confirm('Delete campaign?') && api(`/campaigns/${c.id}`, { method: 'DELETE' }).then(onSaved)}>Delete</button>}
      </div>
    </Drawer>
  );
}
