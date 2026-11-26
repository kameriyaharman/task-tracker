import { dmy } from '../format';
import { DateInput } from '../dateinput';
import { Select } from '../erp/common';
import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Badge, Drawer, Empty, ErrorBox, Field, Icon, Loading, PasswordInput, Person } from '../ui';
import { useMeta } from '../erp/common';

export default function Employees() {
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const { data, error, reload } = useApi<any[]>('/employees', { q, include_inactive: inactive ? 1 : '' });
  const depts = useApi<any[]>('/departments');
  const [edit, setEdit] = useState<any | null>(null);
  const [deptForm, setDeptForm] = useState(false);
  const [pins, setPins] = useState(false);

  return (
    <>
      <Topbar title="Employees" search={q} onSearch={setQ}
        action={<button className="btn" onClick={() => setEdit({})}><Icon name="plus" /> Add employee</button>} />
      <ErrorBox msg={error} />
      <div className="chips">
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show inactive</label>
        <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setPins(true)}>🔑 App login PINs</button>
        {me?.role === 'owner' && <button className="btn ghost sm" onClick={() => setDeptForm(true)}>Departments</button>}
      </div>
      {!data ? <Loading /> : (
        <>
        {/* phone: one compact card per person */}
        <div className="emp-list">
          {data.map((u) => (
            <div key={u.id} className="emp-card" onClick={() => setEdit(u)} style={{ opacity: +u.is_active ? 1 : 0.5 }}>
              <Person name={u.name} sub={u.designation} initials={u.initials} />
              <div className="emp-meta">
                <span>📞 {u.mobile}</span>
                {u.department_name && <span>{u.department_name}</span>}
                <Badge s={u.role === 'owner' ? 'scheduled' : u.role === 'manager' ? 'in_progress' : ''}>{u.role}</Badge>
                {u.erp_role_name && <span className="badge">{u.erp_role_name}</span>}
                {+u.location_consent ? <Badge s="present">📍 Shared</Badge> : null}
                {+u.has_pin ? <span className="badge">🔑 PIN set</span> : <span className="badge" style={{ color: '#c0392b' }}>No app PIN</span>}
              </div>
              {u.manager_name && <small className="muted">Reports to {u.manager_name}</small>}
            </div>
          ))}
        </div>
        <div className="card emp-table" style={{ padding: 6 }}>
          {data.length ? (
            <table className="t">
              <thead><tr><th>Name</th><th>Mobile</th><th>Department</th><th>Reports to</th><th>Role</th><th>Showroom role</th><th>App PIN</th><th>Location</th></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className="click" onClick={() => setEdit(u)} style={{ opacity: +u.is_active ? 1 : 0.5 }}>
                    <td><Person name={u.name} sub={u.designation} initials={u.initials} /></td>
                    <td>{u.mobile}</td>
                    <td>{u.department_name ?? '—'}</td>
                    <td>{u.manager_name ?? '—'}</td>
                    <td><Badge s={u.role === 'owner' ? 'scheduled' : u.role === 'manager' ? 'in_progress' : ''}>{u.role}</Badge></td>
                    <td>{u.erp_role_name ?? <span className="muted">—</span>}</td>
                    <td>{+u.has_pin ? '🔑 Set' : <span style={{ color: '#c0392b' }}>Not set</span>}</td>
                    <td>{+u.location_consent ? <Badge s="present">Shared</Badge> : <span className="muted">Off</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No employees</Empty>}
        </div>
        </>
      )}
      {edit && <EmployeeForm u={edit} people={data ?? []} depts={depts.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {pins && <PinsDrawer people={data ?? []} onClose={() => { setPins(false); reload(); }} />}
      {deptForm && <DeptForm depts={depts.data ?? []} heads={data ?? []} onClose={() => setDeptForm(false)} reload={depts.reload} />}
    </>
  );
}

function EmployeeForm({ u, people, depts, onClose, onSaved }: { u: any; people: any[]; depts: any[]; onClose: () => void; onSaved: () => void }) {
  const { me } = useAuth();
  const { meta } = useMeta();
  const [f, setF] = useState({ erp_role_id: u.erp_role_id ?? '', name: u.name ?? '', mobile: u.mobile ?? '', email: u.email ?? '', designation: u.designation ?? '', role: u.role ?? 'employee', department_id: u.department_id ?? '', manager_id: u.manager_id ?? '', joined_on: u.joined_on ?? '', deputy_id: u.deputy_id ?? '', is_active: u.id ? !!+u.is_active : true, password: '', pin: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    const body: Record<string, unknown> = { ...f, department_id: f.department_id || null, manager_id: f.manager_id || null, erp_role_id: f.erp_role_id || null, deputy_id: f.deputy_id || null };
    if (!f.password) delete body.password;
    if (!f.pin) delete body.pin;
    else if (!/^\d{4}$/.test(f.pin)) { setErr('App PIN must be 4 digits'); return; }
    try {
      if (u.id) await api(`/employees/${u.id}`, { method: 'PATCH', body }); else await api('/employees', { body });
      onSaved();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Drawer title={u.id ? 'Edit employee' : 'Add employee'} onClose={onClose}>
      <ErrorBox msg={err} />
      <Field label="Full name"><input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid g2">
        <Field label="Mobile (app login)"><input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="98XXXXXXXX" /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Designation"><input value={f.designation} onChange={(e) => set('designation', e.target.value)} /></Field>
        <Field label="Role"><select value={f.role} onChange={(e) => set('role', e.target.value)}>
          <option value="employee">Employee</option><option value="manager">Manager</option>{me?.role === 'owner' && <option value="owner">Owner</option>}
        </select></Field>
        <Field label="Department"><select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Reports to"><Select value={f.manager_id} onChange={(v) => set('manager_id', v)} options={people.filter((p) => p.id !== u.id && p.role !== 'employee')} /></Field>
        <Field label="Backup / deputy (approves & covers when away)"><Select value={f.deputy_id} onChange={(v) => set('deputy_id', v)} options={people.filter((p) => p.id !== u.id)} /></Field>
        <Field label="Joined on"><DateInput value={f.joined_on} onChange={(e) => set('joined_on', e.target.value)} /></Field>
        {f.role === 'employee' && <Field label="Showroom role (what they can do)"><select value={f.erp_role_id} onChange={(e) => set('erp_role_id', e.target.value)}><option value="">— none (app tasks & attendance only) —</option>{(meta?.erp_roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></Field>}
        {(f.role !== 'employee' || f.erp_role_id) && <Field label={u.id ? 'New admin panel password (leave empty to keep)' : 'Admin panel password (optional)'}><PasswordInput value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>}
        <Field label={u.id ? (+u.has_pin ? 'New app login PIN (leave empty to keep)' : 'App login PIN — not set yet') : 'App login PIN (4 digits)'}>
          <div className="row"><input value={f.pin} inputMode="numeric" maxLength={4} placeholder="e.g. 4821" onChange={(e) => set('pin', e.target.value.replace(/\D/g, '').slice(0, 4))} style={{ flex: 1 }} />
            <button type="button" className="btn ghost sm" onClick={() => set('pin', String(Math.floor(1000 + Math.random() * 9000)))}>Make one</button></div>
          {f.pin && <small className="muted">Tell {f.name || 'them'}: mobile {f.mobile} + PIN {f.pin} to log in to the app.</small>}
        </Field>
      </div>
      {u.id && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Active (can log in)</label>}
      <button className="btn" disabled={!f.name || !f.mobile} onClick={save}>Save</button>
      {u.id && <Handover from={u} people={people} />}
    </Drawer>
  );
}

/** Going on leave / leaving: move every open task of this person to a colleague (can be handed back later). */
function Handover({ from, people }: { from: any; people: any[] }) {
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const hist = useApi<any[]>('/tasks/handovers');
  const mine = (hist.data ?? []).filter((h) => h.from_user === from.id || +h.from_user === from.id);
  const go = async () => {
    setErr(null); setMsg(null);
    try {
      const r = await api<any>('/tasks/handover', { body: { from_user: from.id, to_user: +to, note } });
      setMsg(`${r.moved} open tasks moved to ${r.to}`); hist.reload();
    } catch (e) { setErr((e as Error).message); }
  };
  return (
    <div className="card" style={{ marginTop: 16, padding: 12 }}>
      <h3>Hand over tasks (leave / emergency)</h3>
      <p className="muted" style={{ marginTop: 0 }}>All of {from.name.split(' ')[0]}'s open tasks go to the person you choose. You can hand them back later.</p>
      <ErrorBox msg={err} />
      {msg && <div className="ok-text" style={{ marginBottom: 8 }}>✓ {msg}</div>}
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <select className="input" style={{ flex: 1, minWidth: 160 }} value={to} onChange={(e) => setTo(e.target.value)}>
          <option value="">Hand over to…</option>{people.filter((p) => p.id !== from.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <input className="input" style={{ flex: 1, minWidth: 140 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (on leave till 30 Nov)" />
        <button className="btn ghost" disabled={!to} onClick={go}>Hand over</button>
      </div>
      {mine.map((h) => (
        <div key={h.id} className="list-item between">
          <span className="muted">{dmy(h.created_at)} · {h.task_count} tasks → {h.to_name}{h.note ? ` · ${h.note}` : ''}</span>
          {h.returned_at ? <span className="muted">returned</span> : <button className="link" onClick={() => api<any>(`/tasks/handovers/${h.id}/return`, { body: {} }).then((r) => { setMsg(`${r.returned} tasks handed back`); hist.reload(); })}>Hand back</button>}
        </div>
      ))}
    </div>
  );
}

function DeptForm({ depts, heads, onClose, reload }: { depts: any[]; heads: any[]; onClose: () => void; reload: () => void }) {
  const [name, setName] = useState('');
  return (
    <Drawer title="Departments" onClose={onClose} modal>
      {depts.map((d) => (
        <div key={d.id} className="list-item between"><span>{d.name} <span className="muted">· {d.members} people</span></span>
          <select className="input" style={{ width: 170 }} value={d.head_user_id ?? ''} title="Department head (gets escalations, approves requests)"
            onChange={(e) => api(`/departments/${d.id}`, { method: 'PATCH', body: { name: d.name, head_user_id: e.target.value || null } }).then(reload)}>
            <option value="">Head: —</option>{(heads ?? []).map((p: any) => <option key={p.id} value={p.id}>Head: {p.name}</option>)}
          </select>
          <button className="link" onClick={() => confirm(`Delete ${d.name}?`) && api(`/departments/${d.id}`, { method: 'DELETE' }).then(reload)}>Delete</button></div>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New department" />
        <button className="btn" disabled={!name} onClick={() => api('/departments', { body: { name } }).then(() => { setName(''); reload(); })}>Add</button>
      </div>
    </Drawer>
  );
}

/** Give everyone an app-login PIN at once (no SMS needed). Shows each PIN once, with a WhatsApp button. */
function PinsDrawer({ people, onClose }: { people: any[]; onClose: () => void }) {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const missing = people.filter((p) => +p.is_active && !+p.has_pin).length;
  const gen = async (onlyMissing: boolean) => {
    if (!onlyMissing && !confirm('Give NEW PINs to everyone? Old PINs will stop working.')) return;
    setErr(null);
    try { setRows(await api<any[]>('/employees/pins', { body: { only_missing: onlyMissing } })); } catch (e) { setErr((e as Error).message); }
  };
  const msg = (r: any) => `Namaste ${r.name}, Keshav app login: mobile ${r.mobile}, PIN ${r.pin}. App: https://keshav-apk-production.up.railway.app`;
  return (
    <Drawer title="App login PINs" onClose={onClose}>
      <ErrorBox msg={err} />
      <p className="muted">Staff log in to the app with their <b>mobile number + 4-digit PIN</b>. No SMS needed. You can also set or change one person's PIN from their employee form.</p>
      {!rows ? (
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <button className="btn" disabled={!missing} onClick={() => gen(true)}>Make PINs for {missing} people without one</button>
          <button className="btn ghost" onClick={() => gen(false)}>New PINs for everyone</button>
        </div>
      ) : (
        <>
          <div className="lock-note warn">Note these PINs now — they are shown only once. Send each person their PIN.</div>
          <table className="t"><thead><tr><th>Name</th><th>Mobile</th><th>PIN</th><th></th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id}><td>{r.name}</td><td>{r.mobile}</td><td><b style={{ fontSize: 16, letterSpacing: 2 }}>{r.pin}</b></td>
                <td><a className="btn ghost sm" target="_blank" rel="noreferrer" href={`https://wa.me/91${r.mobile}?text=${encodeURIComponent(msg(r))}`}>WhatsApp</a></td></tr>
            ))}</tbody></table>
          {!rows.length && <Empty>Everyone already has a PIN</Empty>}
          <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(rows.map((r) => `${r.name} — ${r.mobile} — PIN ${r.pin}`).join('\n'))}>Copy list</button>
        </>
      )}
    </Drawer>
  );
}
