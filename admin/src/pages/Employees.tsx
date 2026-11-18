import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Badge, Drawer, Empty, ErrorBox, Field, Icon, Loading, Person } from '../ui';

export default function Employees() {
  const { me } = useAuth();
  const [q, setQ] = useState('');
  const [inactive, setInactive] = useState(false);
  const { data, error, reload } = useApi<any[]>('/employees', { q, include_inactive: inactive ? 1 : '' });
  const depts = useApi<any[]>('/departments');
  const [edit, setEdit] = useState<any | null>(null);
  const [deptForm, setDeptForm] = useState(false);

  return (
    <>
      <Topbar title="Employees" search={q} onSearch={setQ}
        action={<button className="btn" onClick={() => setEdit({})}><Icon name="plus" /> Add employee</button>} />
      <ErrorBox msg={error} />
      <div className="chips">
        <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={inactive} onChange={(e) => setInactive(e.target.checked)} /> Show inactive</label>
        {me?.role === 'owner' && <button className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={() => setDeptForm(true)}>Departments</button>}
      </div>
      {!data ? <Loading /> : (
        <div className="card" style={{ padding: 6 }}>
          {data.length ? (
            <table className="t">
              <thead><tr><th>Name</th><th>Mobile</th><th>Department</th><th>Reports to</th><th>Role</th><th>Location</th></tr></thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id} className="click" onClick={() => setEdit(u)} style={{ opacity: +u.is_active ? 1 : 0.5 }}>
                    <td><Person name={u.name} sub={u.designation} initials={u.initials} /></td>
                    <td>{u.mobile}</td>
                    <td>{u.department_name ?? '—'}</td>
                    <td>{u.manager_name ?? '—'}</td>
                    <td><Badge s={u.role === 'owner' ? 'scheduled' : u.role === 'manager' ? 'in_progress' : ''}>{u.role}</Badge></td>
                    <td>{+u.location_consent ? <Badge s="present">Shared</Badge> : <span className="muted">Off</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <Empty>No employees</Empty>}
        </div>
      )}
      {edit && <EmployeeForm u={edit} people={data ?? []} depts={depts.data ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); reload(); }} />}
      {deptForm && <DeptForm depts={depts.data ?? []} onClose={() => setDeptForm(false)} reload={depts.reload} />}
    </>
  );
}

function EmployeeForm({ u, people, depts, onClose, onSaved }: { u: any; people: any[]; depts: any[]; onClose: () => void; onSaved: () => void }) {
  const { me } = useAuth();
  const [f, setF] = useState({ name: u.name ?? '', mobile: u.mobile ?? '', email: u.email ?? '', designation: u.designation ?? '', role: u.role ?? 'employee', department_id: u.department_id ?? '', manager_id: u.manager_id ?? '', joined_on: u.joined_on ?? '', is_active: u.id ? !!+u.is_active : true, password: '' });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string, v: unknown) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    const body: Record<string, unknown> = { ...f, department_id: f.department_id || null, manager_id: f.manager_id || null };
    if (!f.password) delete body.password;
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
        <Field label="Mobile (OTP login)"><input value={f.mobile} onChange={(e) => set('mobile', e.target.value)} placeholder="98XXXXXXXX" /></Field>
        <Field label="Email"><input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field label="Designation"><input value={f.designation} onChange={(e) => set('designation', e.target.value)} /></Field>
        <Field label="Role"><select value={f.role} onChange={(e) => set('role', e.target.value)}>
          <option value="employee">Employee</option><option value="manager">Manager</option>{me?.role === 'owner' && <option value="owner">Owner</option>}
        </select></Field>
        <Field label="Department"><select value={f.department_id} onChange={(e) => set('department_id', e.target.value)}><option value="">—</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Reports to"><select value={f.manager_id} onChange={(e) => set('manager_id', e.target.value)}><option value="">—</option>{people.filter((p) => p.id !== u.id && p.role !== 'employee').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Joined on"><input type="date" value={f.joined_on} onChange={(e) => set('joined_on', e.target.value)} /></Field>
        {f.role !== 'employee' && <Field label={u.id ? 'New admin password' : 'Admin panel password'}><input type="password" value={f.password} onChange={(e) => set('password', e.target.value)} /></Field>}
      </div>
      {u.id && <label className="check"><input type="checkbox" checked={f.is_active} onChange={(e) => set('is_active', e.target.checked)} /> Active (can log in)</label>}
      <button className="btn" disabled={!f.name || !f.mobile} onClick={save}>Save</button>
    </Drawer>
  );
}

function DeptForm({ depts, onClose, reload }: { depts: any[]; onClose: () => void; reload: () => void }) {
  const [name, setName] = useState('');
  return (
    <Drawer title="Departments" onClose={onClose} modal>
      {depts.map((d) => (
        <div key={d.id} className="list-item between"><span>{d.name} <span className="muted">· {d.members} people</span></span>
          <button className="link" onClick={() => confirm(`Delete ${d.name}?`) && api(`/departments/${d.id}`, { method: 'DELETE' }).then(reload)}>Delete</button></div>
      ))}
      <div className="row" style={{ marginTop: 12 }}>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="New department" />
        <button className="btn" disabled={!name} onClick={() => api('/departments', { body: { name } }).then(() => { setName(''); reload(); })}>Add</button>
      </div>
    </Drawer>
  );
}
