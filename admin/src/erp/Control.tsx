import { useEffect, useState } from 'react';
import { api, downloadUrl } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { Drawer, ErrorBox, Field, Icon } from '../ui';
import { DataTable, Kpi, ReasonModal, ReportTable, Select, St, Tabs, d8, dt, rs, useAction, useMeta, type Meta } from './common';

// ───────── Workflow builder ─────────
type Step = { name: string; type: string; assign_type: string; assign_value: string | null; due_hours: number | string | null; priority: string; parallel: boolean; min_amount: any; max_amount: any; proof: string | null; description: string | null };
const blank = (): Step => ({ name: '', type: 'task', assign_type: 'erp_role', assign_value: '', due_hours: 24, priority: 'medium', parallel: false, min_amount: '', max_amount: '', proof: null, description: '' });

export function Workflows() {
  const { me } = useAuth();
  const { meta } = useMeta();
  const [tab, setTab] = useState('flows');
  const wf = useApi<any>('/erp/workflows');
  const [runStatus, setRunStatus] = useState('running');
  const runs = useApi<any[]>(tab === 'runs' ? '/erp/workflow-runs' : null, { status: runStatus });
  const [edit, setEdit] = useState<any>(null);
  const [cancelRun, setCancelRun] = useState<any>(null);
  const [start, setStart] = useState<any>(null);
  const a = useAction();
  const owner = me?.role === 'owner';
  return (
    <>
      <Topbar title="Workflows" action={owner && tab === 'flows' ? <button className="btn" onClick={() => setEdit({ name: '', trigger_event: 'purchase_order.approved', is_active: true, steps: [blank()] })}><Icon name="plus" /> New workflow</button> : undefined} />
      <ErrorBox msg={wf.error || a.err} />
      <Tabs value={tab} onChange={setTab} tabs={[['flows', 'Processes'], ['runs', 'Running now']]} />
      {tab === 'flows' && (
        <div className="grid g2">
          {(wf.data?.workflows ?? []).map((w: any) => (
            <div key={w.id} className="card" style={{ opacity: +w.is_active ? 1 : 0.55 }}>
              <h3 className="between">{w.name} <span className="muted" style={{ fontWeight: 400, fontSize: 12 }}>v{w.version} · {w.running} running</span></h3>
              <div className="muted" style={{ marginBottom: 8 }}>Starts when: <b>{wf.data.events[w.trigger_event]}</b>{w.min_amount ? ` · amount ≥ ${rs(w.min_amount)}` : ''}{w.max_amount ? ` · ≤ ${rs(w.max_amount)}` : ''}</div>
              <ol className="steps">
                {w.steps.map((s: Step, i: number) => (
                  <li key={i} className={s.parallel ? 'par' : ''}>
                    {s.parallel && <span className="badge scheduled">parallel</span>} {s.type === 'approval' ? '✔ Approve: ' : s.type === 'notify' ? '🔔 ' : ''}{s.name}
                    <div className="muted">{assignLabel(s, meta)}{s.due_hours ? ` · ${s.due_hours} h` : ''}{s.proof ? ` · ${s.proof} proof` : ''}{s.min_amount ? ` · only if ≥ ${rs(s.min_amount)}` : ''}</div>
                  </li>
                ))}
              </ol>
              <div className="row">
                {owner && <button className="btn sm ghost" onClick={() => setEdit({ ...w, steps: w.steps.map((s: any) => ({ ...blank(), ...s })) })}>Edit</button>}
                {w.trigger_event === 'manual' && <button className="btn sm" onClick={() => setStart({ id: w.id, title: '', amount: '' })}>Start now</button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === 'runs' && (
        <>
          <Tabs value={runStatus} onChange={setRunStatus} tabs={[['running', 'Running'], ['paused', 'Paused'], ['completed', 'Completed'], ['cancelled', 'Cancelled']]} />
          <DataTable rows={runs.data} empty="Nothing here" cols={[
            ['Process', (r) => <>{r.workflow_name}<div className="muted">{r.title}</div></>], ['Started', (r) => dt(r.started_at)],
            ['Step', (r) => `${Math.min(r.current_step + 1, r.step_count)} / ${r.step_count}`],
            ['Tasks', (r) => r.tasks.map((t: any) => <div key={t.id} className="muted">{t.status === 'done' ? '✅' : t.status === 'cancelled' ? '✖' : '⏳'} {t.assignee}: {t.title.split(' · ')[0]}</div>)],
            ['Status', (r) => <St s={r.status} />],
            ['', (r) => ['running', 'paused'].includes(r.status) ? <div className="row">
              <button className="btn sm ghost" onClick={() => a.run(async () => { await api(`/erp/workflow-runs/${r.id}`, { body: { action: r.status === 'paused' ? 'resume' : 'pause' } }); runs.reload(); })}>{r.status === 'paused' ? 'Resume' : 'Pause'}</button>
              <button className="btn sm danger" onClick={() => setCancelRun(r)}>Stop</button></div> : null],
          ]} />
        </>
      )}
      {edit && <WorkflowEditor wf={edit} meta={wf.data} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); wf.reload(); }} />}
      {cancelRun && <ReasonModal title={`Stop "${cancelRun.title}"?`} onClose={() => setCancelRun(null)} onOk={async (reason) => { await api(`/erp/workflow-runs/${cancelRun.id}`, { body: { action: 'cancel', reason } }); runs.reload(); }} />}
      {start && (
        <Drawer title="Start process" onClose={() => setStart(null)} modal>
          <Field label="Title"><input value={start.title} onChange={(e) => setStart({ ...start, title: e.target.value })} placeholder="e.g. New tiles range purchase" /></Field>
          <Field label="Amount (for amount-based steps)"><input type="number" value={start.amount} onChange={(e) => setStart({ ...start, amount: e.target.value })} /></Field>
          <button className="btn" onClick={() => a.run(async () => { await api(`/erp/workflows/${start.id}/start`, { body: start }); setStart(null); setTab('runs'); })}>Start</button>
        </Drawer>
      )}
    </>
  );
}

function assignLabel(s: Step, m: Meta | null) {
  switch (s.assign_type) {
    case 'erp_role': return `→ ${m?.erp_roles.find((r) => String(r.id) === String(s.assign_value))?.name ?? 'role'}`;
    case 'role': return `→ ${s.assign_value === 'owner' ? 'Boss' : 'Manager'}`;
    case 'user': return `→ ${m?.users.find((u) => String(u.id) === String(s.assign_value))?.name ?? 'person'}`;
    case 'department': return '→ department';
    default: return '→ person who created it';
  }
}

function WorkflowEditor({ wf, meta, onClose, onSaved }: { wf: any; meta: any; onClose: () => void; onSaved: () => void }) {
  const { meta: m } = useMeta();
  const [f, setF] = useState<any>(wf);
  const a = useAction();
  const steps: Step[] = f.steps;
  const setStep = (i: number, k: string, v: any) => setF({ ...f, steps: steps.map((s, j) => (j === i ? { ...s, [k]: v } : s)) });
  const move = (i: number, d: number) => { const s = [...steps]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x); setF({ ...f, steps: s }); };
  const depts = useApi<any[]>('/departments');
  const save = () => a.run(async () => {
    if (f.id) await api(`/erp/workflows/${f.id}`, { method: 'PATCH', body: f }); else await api('/erp/workflows', { body: f });
    onSaved();
  });
  return (
    <Drawer title={f.id ? `Edit · ${f.name}` : 'New workflow'} wide onClose={onClose}>
      <ErrorBox msg={a.err} />
      <Field label="Process name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Big purchase process" /></Field>
      <div className="grid g2">
        <Field label="Starts when"><select value={f.trigger_event} onChange={(e) => setF({ ...f, trigger_event: e.target.value })}>{Object.entries(meta?.events ?? {}).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</select></Field>
        <div className="grid g2" style={{ gap: 8 }}>
          <Field label="Only if amount ≥"><input type="number" value={f.min_amount ?? ''} onChange={(e) => setF({ ...f, min_amount: e.target.value })} /></Field>
          <Field label="and ≤"><input type="number" value={f.max_amount ?? ''} onChange={(e) => setF({ ...f, max_amount: e.target.value })} /></Field>
        </div>
      </div>
      {steps.map((s, i) => (
        <div key={i} className="card step-card">
          <div className="between"><b>Step {i + 1}</b>
            <span className="row">
              {i > 0 && <button className="link" onClick={() => move(i, -1)}>↑</button>}
              {i < steps.length - 1 && <button className="link" onClick={() => move(i, 1)}>↓</button>}
              <button className="link" onClick={() => setF({ ...f, steps: steps.filter((_, j) => j !== i) })}>Remove</button>
            </span>
          </div>
          <div className="grid g2">
            <Field label="What needs to be done"><input value={s.name} onChange={(e) => setStep(i, 'name', e.target.value)} placeholder="e.g. Check material quality" /></Field>
            <Field label="Kind"><select value={s.type} onChange={(e) => setStep(i, 'type', e.target.value)}><option value="task">Task</option><option value="approval">Approval task</option><option value="notify">Only notify</option></select></Field>
            <Field label="Who does it"><select value={s.assign_type} onChange={(e) => setStep(i, 'assign_type', e.target.value)}>
              <option value="erp_role">A role (least busy person)</option><option value="role">Manager / Boss</option><option value="user">A specific person</option><option value="department">A department</option><option value="creator">Person who created it</option></select></Field>
            {s.assign_type === 'erp_role' && <Field label="Role"><Select value={s.assign_value} onChange={(v) => setStep(i, 'assign_value', v)} options={m?.erp_roles ?? []} /></Field>}
            {s.assign_type === 'role' && <Field label="Who"><select value={s.assign_value ?? 'manager'} onChange={(e) => setStep(i, 'assign_value', e.target.value)}><option value="manager">Manager</option><option value="owner">Boss</option></select></Field>}
            {s.assign_type === 'user' && <Field label="Person"><Select value={s.assign_value} onChange={(v) => setStep(i, 'assign_value', v)} options={m?.users ?? []} /></Field>}
            {s.assign_type === 'department' && <Field label="Department"><Select value={s.assign_value} onChange={(v) => setStep(i, 'assign_value', v)} options={depts.data ?? []} /></Field>}
            {s.type !== 'notify' && <Field label="Time allowed (hours)"><input type="number" value={s.due_hours ?? ''} onChange={(e) => setStep(i, 'due_hours', e.target.value)} /></Field>}
            {s.type !== 'notify' && <Field label="Proof needed"><select value={s.proof ?? ''} onChange={(e) => setStep(i, 'proof', e.target.value || null)}><option value="">None</option><option value="photo">Photo</option><option value="file">Document</option><option value="location">Location</option></select></Field>}
            <Field label="Run only if amount ≥ (optional)"><input type="number" value={s.min_amount ?? ''} onChange={(e) => setStep(i, 'min_amount', e.target.value)} /></Field>
            {s.type !== 'notify' && <Field label="Priority"><select value={s.priority} onChange={(e) => setStep(i, 'priority', e.target.value)}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></Field>}
          </div>
          <Field label="Instructions"><input value={s.description ?? ''} onChange={(e) => setStep(i, 'description', e.target.value)} /></Field>
          {i > 0 && <label className="check"><input type="checkbox" checked={!!s.parallel} onChange={(e) => setStep(i, 'parallel', e.target.checked)} /> Run at the same time as the step above (parallel)</label>}
        </div>
      ))}
      <button className="btn ghost" onClick={() => setF({ ...f, steps: [...steps, blank()] })}><Icon name="plus" /> Add step</button>
      <label className="check" style={{ marginTop: 12 }}><input type="checkbox" checked={!!+f.is_active} onChange={(e) => setF({ ...f, is_active: e.target.checked })} /> Active</label>
      <p className="muted">Changes apply to new items only. Anything already running keeps its old steps.</p>
      <button className="btn" disabled={!f.name || a.busy} onClick={save}>Save workflow</button>
    </Drawer>
  );
}

// ───────── Roles, permissions & approval rules ─────────
export function AccessControl() {
  const { me } = useAuth();
  const { meta, reload: reloadMeta } = useMeta();
  const [tab, setTab] = useState('people');
  const roles = useApi<any>('/erp/roles');
  const rules = useApi<any>('/erp/approval-rules');
  const [editRole, setEditRole] = useState<any>(null);
  const [ruleRows, setRuleRows] = useState<any[] | null>(null);
  const a = useAction();
  const owner = me?.role === 'owner';
  useEffect(() => { if (rules.data) setRuleRows(rules.data.rules.map((r: any) => ({ ...r }))); }, [rules.data]);
  return (
    <>
      <Topbar title="Roles & approvals" />
      <ErrorBox msg={a.err} />
      <Tabs value={tab} onChange={setTab} tabs={[['people', 'Who has which role'], ['roles', 'Role permissions'], ['rules', 'Approval rules']]} />
      {tab === 'people' && (
        <DataTable rows={meta?.users} cols={[
          ['Person', (u) => u.name], ['Login type', (u) => (u.role === 'owner' ? 'Boss (full access)' : u.role === 'manager' ? 'Manager (all modules + approvals)' : 'Employee')],
          ['ERP role', (u) => u.role === 'employee' ? (
            <select value={u.erp_role_id ?? ''} onChange={(e) => a.run(async () => { await api('/erp/roles/assign', { body: { user_id: u.id, erp_role_id: e.target.value || null } }); reloadMeta(); roles.reload(); })}>
              <option value="">— none (tasks & attendance only) —</option>{(meta?.erp_roles ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>) : <span className="muted">Not needed</span>],
        ]} />
      )}
      {tab === 'roles' && roles.data && (
        <>
          {owner && <button className="btn" style={{ marginBottom: 12 }} onClick={() => setEditRole({ name: '', perms: {} })}><Icon name="plus" /> New role</button>}
          <div className="card" style={{ padding: 6, overflowX: 'auto' }}>
            <table className="t">
              <thead><tr><th>Role</th>{Object.values(roles.data.modules).map((m: any) => <th key={m} style={{ fontSize: 10.5 }}>{m.split(' (')[0]}</th>)}<th>People</th></tr></thead>
              <tbody>{roles.data.roles.map((r: any) => (
                <tr key={r.id} className={owner ? 'click' : ''} onClick={owner ? () => setEditRole(r) : undefined}><td><b style={{ fontWeight: 500 }}>{r.name}</b></td>
                  {Object.keys(roles.data.modules).map((k) => <td key={k}>{r.perms[k] === 'edit' ? '✏️' : r.perms[k] === 'view' ? '👁' : ''}</td>)}<td>{r.members}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="muted">✏️ = can add/edit · 👁 = view only. Boss and managers have every module; workflows, approval rules and Tally are boss-only.</p>
        </>
      )}
      {tab === 'rules' && ruleRows && (
        <div className="card">
          <p className="muted">For each document, the rule with the highest "from amount" that the value reaches decides who approves. Remove all rules of a type = no approval needed.</p>
          <table className="t">
            <thead><tr><th>Document</th><th>From amount / %</th><th>Who approves</th><th>Active</th><th /></tr></thead>
            <tbody>{ruleRows.map((r, i) => (
              <tr key={i}>
                <td><select value={r.doc_type} disabled={!owner} onChange={(e) => setRuleRows(ruleRows.map((x, j) => (j === i ? { ...x, doc_type: e.target.value } : x)))}>{Object.entries(rules.data.types).map(([k, v]) => <option key={k} value={k}>{v as string}</option>)}</select></td>
                <td><input type="number" disabled={!owner} value={r.min_amount} onChange={(e) => setRuleRows(ruleRows.map((x, j) => (j === i ? { ...x, min_amount: e.target.value } : x)))} style={{ width: 110 }} /></td>
                <td><select value={r.levels} disabled={!owner} onChange={(e) => setRuleRows(ruleRows.map((x, j) => (j === i ? { ...x, levels: e.target.value } : x)))}><option value="manager">Manager</option><option value="owner">Boss</option><option value="manager_owner">Manager, then Boss</option></select></td>
                <td><input type="checkbox" disabled={!owner} checked={!!+r.is_active} onChange={(e) => setRuleRows(ruleRows.map((x, j) => (j === i ? { ...x, is_active: e.target.checked ? 1 : 0 } : x)))} /></td>
                <td>{owner && <button className="link" onClick={() => setRuleRows(ruleRows.filter((_, j) => j !== i))}>Remove</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {owner && <div className="row" style={{ marginTop: 10 }}>
            <button className="btn ghost" onClick={() => setRuleRows([...ruleRows, { doc_type: 'purchase_order', min_amount: 0, levels: 'manager', is_active: 1 }])}><Icon name="plus" /> Add rule</button>
            <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api('/erp/approval-rules', { body: { rules: ruleRows } }); rules.reload(); })}>Save rules</button>
          </div>}
        </div>
      )}
      {editRole && roles.data && (
        <Drawer title={editRole.id ? editRole.name : 'New role'} onClose={() => setEditRole(null)}>
          <Field label="Role name"><input value={editRole.name} onChange={(e) => setEditRole({ ...editRole, name: e.target.value })} /></Field>
          {Object.entries(roles.data.modules).map(([k, label]) => (
            <div key={k} className="list-item between"><span>{label as string}</span>
              <div className="seg">{[['', 'None'], ['view', 'View'], ['edit', 'Edit']].map(([v, l]) => (
                <button key={v} className={(editRole.perms[k] ?? '') === v ? 'on' : ''} onClick={() => setEditRole({ ...editRole, perms: { ...editRole.perms, [k]: v || undefined } })}>{l}</button>
              ))}</div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={!editRole.name} onClick={() => a.run(async () => {
              const perms = Object.fromEntries(Object.entries(editRole.perms).filter(([, v]) => v));
              if (editRole.id) await api(`/erp/roles/${editRole.id}`, { method: 'PATCH', body: { name: editRole.name, perms } }); else await api('/erp/roles', { body: { name: editRole.name, perms } });
              setEditRole(null); roles.reload(); reloadMeta();
            })}>Save</button>
            {editRole.id && <button className="btn danger" onClick={() => confirm('Delete this role? People with it will lose ERP access.') && a.run(async () => { await api(`/erp/roles/${editRole.id}`, { method: 'DELETE' }); setEditRole(null); roles.reload(); reloadMeta(); })}>Delete</button>}
          </div>
        </Drawer>
      )}
    </>
  );
}

// ───────── Reports ─────────
const REPORTS: [string, string][] = [
  ['sales', 'Sales register'], ['sales_by_product', 'Product-wise sales'], ['sales_by_customer', 'Customer-wise sales'], ['purchase', 'Purchase register'],
  ['stock', 'Stock & valuation'], ['product_movement', 'Fast / slow / dead stock'], ['recovery', 'Recovery (collections)'], ['delivery', 'Delivery report'],
  ['expenses', 'Expenses'], ['gst', 'GST summary'], ['employee_performance', 'Employee performance'], ['pending_tasks', 'Pending tasks'], ['overdue_tasks', 'Overdue tasks'],
];
export function ErpReports() {
  const [type, setType] = useState('sales');
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const r = useApi<any>(`/erp/reports/${type}`, { from, to });
  return (
    <>
      <Topbar title="Business reports" action={<a className="btn ghost" href={downloadUrl(`/erp/reports/${type}`, { from, to, format: 'csv' })}><Icon name="download" /> Excel (CSV)</a>} />
      <div className="chips">
        <select value={type} onChange={(e) => setType(e.target.value)}>{REPORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        <span className="muted">Customer / vendor outstanding & aging are under Accounts.</span>
      </div>
      <ErrorBox msg={r.error} />
      {r.data && <ReportTable rows={r.data.rows} />}
    </>
  );
}

// ───────── Tally ─────────
const LEDGER_LABELS: Record<string, string> = {
  sales: 'Sales ledger', purchase: 'Purchase ledger', cash: 'Cash', bank: 'Bank', cgst_out: 'Output CGST', sgst_out: 'Output SGST', cgst_in: 'Input CGST', sgst_in: 'Input SGST',
  discount: 'Discount', expense: 'Expenses', sales_return: 'Sales return', purchase_return: 'Purchase return', walkin: 'Walk-in customer ledger',
};
export function TallySync() {
  const s = useApi<any>('/erp/tally/settings');
  const [status, setStatus] = useState('');
  const q = useApi<any[]>('/erp/tally/queue', { status });
  const [f, setF] = useState<any>(null);
  const a = useAction();
  useEffect(() => { if (s.data) setF({ enabled: s.data.enabled, company: s.data.company ?? '', url: s.data.url ?? 'http://localhost:9000', ledgers: s.data.ledgers }); }, [s.data]);
  const count = (k: string) => Number(s.data?.counts?.find((c: any) => c.status === k)?.n ?? 0);
  return (
    <>
      <Topbar title="Tally sync" />
      <ErrorBox msg={s.error || a.err} />
      {f && (
        <div className="grid g21">
          <div className="card">
            <h3>Settings</h3>
            <label className="check"><input type="checkbox" checked={f.enabled} onChange={(e) => setF({ ...f, enabled: e.target.checked })} /> Send vouchers to Tally</label>
            <div className="grid g2">
              <Field label="Company name in Tally (exact)"><input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
              <Field label="Tally address on the shop PC"><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} /></Field>
            </div>
            <details><summary style={{ cursor: 'pointer' }}>Ledger names (must match Tally)</summary>
              <div className="grid g2" style={{ marginTop: 10 }}>{Object.keys(LEDGER_LABELS).map((k) => (
                <Field key={k} label={LEDGER_LABELS[k]}><input value={f.ledgers?.[k] ?? ''} onChange={(e) => setF({ ...f, ledgers: { ...f.ledgers, [k]: e.target.value } })} /></Field>
              ))}</div>
            </details>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn" disabled={a.busy} onClick={() => a.run(async () => { await api('/erp/tally/settings', { body: f }); s.reload(); })}>Save</button>
              {s.data?.token && <a className="btn ghost" href={downloadUrl('/erp/tally/connector')}><Icon name="download" /> Download connector for Tally PC</a>}
            </div>
            <ol className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
              <li>In TallyPrime: F1 Help → Settings → Connectivity → TallyPrime acts as <b>Both</b>, port <b>9000</b>.</li>
              <li>Download the connector, copy it to the Tally PC, right-click → <b>Run with PowerShell</b> (keep it running; it can be auto-started with Task Scheduler).</li>
              <li>Bills, purchases, receipts, payments, expenses and returns appear in Tally within a minute. Customers and vendors are created in Tally automatically.</li>
            </ol>
          </div>
          <div className="stack">
            <Kpi label="Waiting to send" value={count('pending')} /><Kpi label="Failed" value={count('failed')} tone={count('failed') ? 'red' : undefined} />
            <Kpi label="Sent" value={count('synced')} sub={s.data?.last_sync ? `last ${dt(s.data.last_sync)}` : undefined} />
            <Kpi label="Connector last seen" value={s.data?.connector_seen ? dt(s.data.connector_seen) : 'Never'} />
            <div className="row">
              <button className="btn ghost sm" onClick={() => a.run(async () => { await api('/erp/tally/retry', { body: {} }); q.reload(); s.reload(); })}>Retry failed</button>
              <button className="btn ghost sm" onClick={() => a.run(async () => { const r = await api('/erp/tally/resync-all', { body: {} }); alert(`${r.queued} documents queued`); q.reload(); s.reload(); })}>Send all old documents</button>
            </div>
          </div>
        </div>
      )}
      <Tabs value={status} onChange={setStatus} tabs={[['', 'All'], ['pending', 'Waiting'], ['failed', 'Failed'], ['synced', 'Sent']]} />
      <DataTable rows={q.data} cols={[
        ['Voucher', (r) => r.voucher_type], ['Document', (r) => `${r.ref_type.replace('_', ' ')} #${r.ref_id}`], ['Queued', (r) => d8(r.created_at)],
        ['Tries', (r) => r.attempts, 'r'], ['Status', (r) => <St s={r.status} />], ['Error', (r) => <span className="muted">{r.error ?? ''}</span>], ['Sent', (r) => dt(r.synced_at)],
      ]} />
    </>
  );
}
