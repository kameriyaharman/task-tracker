import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { Topbar } from '../Layout';
import { useApi } from '../hooks';
import { ErrorBox } from '../ui';
import { DataTable, DecisionModal, St, Tabs, dt, rs, useAction, useMeta } from './common';

const LINK: Record<string, string> = {
  purchase_order: '/erp/purchase/', grn: '/erp/grn/', sales_invoice: '/erp/sales/', vendor_payment: '/erp/accounts', expense: '/erp/expenses', sales_return: '/erp/returns', purchase_return: '/erp/returns',
};

export default function Approvals() {
  const { me } = useAuth();
  const { reload: reloadMeta } = useMeta();
  const [tab, setTab] = useState('pending');
  const { data, error, reload } = useApi<any>('/erp/approvals');
  const [deciding, setDeciding] = useState<{ r: any; approve: boolean } | null>(null);
  const a = useAction();
  const nav = useNavigate();
  const act = (id: number, approve: boolean, remarks?: string) => a.run(async () => {
    await api(`/erp/approvals/${id}`, { body: { approve, remarks } });
    reload(); reloadMeta();
  });
  const open = (r: any) => { const l = LINK[r.doc_type]; if (l) nav(l.endsWith('/') ? l + r.doc_id : l); };
  return (
    <>
      <Topbar title="Approvals" />
      <ErrorBox msg={error || a.err} />
      <Tabs value={tab} onChange={setTab} tabs={[['pending', `Waiting for ${me?.role === 'owner' ? 'boss' : 'you'} (${data?.pending.length ?? 0})`], ['history', 'History']]} />
      {tab === 'pending' ? (
        <DataTable rows={data?.pending} empty="Nothing waiting for approval 🎉" cols={[
          ['Document', (r) => <a className="link" onClick={() => open(r)}>{r.doc_label}</a>],
          ['Details', (r) => r.summary],
          ['Amount', (r) => (r.amount ? rs(r.amount) : '—'), 'r'],
          ['Level', (r) => (r.approver_role === 'owner' ? 'Boss' : 'Manager')],
          ['Requested by', (r) => <>{r.requested_by_name}<div className="muted">{dt(r.created_at)}</div></>],
          ['', (r) => (
            <div className="row">
              <button className="btn ok sm" disabled={a.busy} onClick={() => act(r.id, true)}>Approve</button>
              <button className="btn ghost sm" title="Approve with a note / voice" onClick={() => setDeciding({ r, approve: true })}>🎤</button>
              <button className="btn danger sm" disabled={a.busy} onClick={() => setDeciding({ r, approve: false })}>Reject</button>
            </div>
          )],
        ]} />
      ) : (
        <DataTable rows={data?.history} cols={[
          ['Document', (r) => <a className="link" onClick={() => open(r)}>{r.doc_label}</a>], ['Details', (r) => r.summary],
          ['Amount', (r) => (r.amount ? rs(r.amount) : '—'), 'r'], ['Result', (r) => <St s={r.status} />],
          ['By', (r) => <>{r.acted_by_name} <span className="muted">({r.approver_role === 'owner' ? 'Boss' : 'Manager'})</span><div className="muted">{dt(r.acted_at)}</div></>],
          ['Remarks', (r) => <>{r.remarks ?? ''}{r.voice_id ? <audio controls preload="none" style={{ height: 30, display: 'block' }} src={`/api/files/${r.voice_id}?token=${localStorage.getItem('wt_token')}`} /> : null}</>],
        ]} />
      )}
      {deciding && <DecisionModal title={`${deciding.approve ? 'Approve' : 'Reject'} · ${deciding.r.summary}`} approve={deciding.approve} url={`/erp/approvals/${deciding.r.id}`} onClose={() => setDeciding(null)} onDone={() => { reload(); reloadMeta(); }} />}
    </>
  );
}
