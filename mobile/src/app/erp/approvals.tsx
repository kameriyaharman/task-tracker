import { useState } from 'react';
import { api } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { Button, Card, Empty, ErrorText, Input, Loading, Row, Screen, T } from '../../components/ui';
import { d8, rs } from '../../lib/erp';

const LABEL: Record<string, string> = { purchase_order: 'Purchase order', grn: 'Goods received', sales_invoice: 'Sales bill', vendor_payment: 'Vendor payment', expense: 'Expense', sales_return: 'Sales return', purchase_return: 'Purchase return' };

export default function ErpApprovals() {
  const { data, loading, reload } = useApi<any>('/erp/approvals');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const act = async (id: number, approve: boolean) => {
    setBusy(id); setErr(null);
    try { await api(`/erp/approvals/${id}`, { body: { approve, remarks: approve ? undefined : reason } }); setRejecting(null); setReason(''); await reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const rows: any[] = data?.pending ?? [];
  return (
    <Screen back title={`Approvals${data ? ` (${rows.length})` : ''}`} refreshing={loading} onRefresh={reload}>
      <ErrorText msg={err} />
      {!data ? <Loading /> : rows.length ? rows.map((r) => (
        <Card key={r.id} style={{ marginBottom: 10 }}>
          <Row><T b style={{ flex: 1 }}>{LABEL[r.doc_type] ?? r.doc_type}</T>{r.amount ? <T b>{rs(r.amount)}</T> : null}</Row>
          <T style={{ marginTop: 6 }}>{r.summary}</T>
          <T muted size={12}>{r.requested_by_name} · {d8(r.created_at)} · {r.approver_role === 'owner' ? 'Boss approval' : 'Manager approval'}</T>
          {rejecting === r.id && <Input label="Reason for rejecting" value={reason} onChangeText={setReason} style={{ marginTop: 10 }} />}
          <Row gap={10} style={{ marginTop: 12 }}>
            {rejecting === r.id
              ? <Button small variant="danger" title="Confirm reject" style={{ flex: 1 }} disabled={!reason.trim() || busy === r.id} onPress={() => act(r.id, false)} />
              : <Button small variant="danger" title="Reject" style={{ flex: 1 }} onPress={() => { setRejecting(r.id); setReason(''); }} />}
            <Button small title="Approve" style={{ flex: 1 }} loading={busy === r.id} onPress={() => act(r.id, true)} />
          </Row>
        </Card>
      )) : <Empty text="Nothing waiting for approval" />}
    </Screen>
  );
}
