import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { api, form } from '../../lib/api';
import { mmss, useVoiceNote } from '../../components/media';
import { C } from '../../lib/theme';
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
  const voice = useVoiceNote();
  const act = async (id: number, approve: boolean) => {
    setBusy(id); setErr(null);
    try {
      const withNote = rejecting === id;
      await api(`/erp/approvals/${id}`, { body: form({ approve: approve ? 1 : 0, remarks: withNote ? reason : '', voice_duration: withNote && voice.file ? voice.seconds : undefined }, { voice_note: withNote ? voice.file : null }) });
      setRejecting(null); setReason(''); voice.clear?.(); await reload();
    }
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
          {rejecting === r.id && (
            <>
              <Input label="Reason — write or record" value={reason} onChangeText={setReason} style={{ marginTop: 10 }} />
              <Pressable onPress={() => (voice.recording ? voice.stop() : voice.start())} style={{ alignSelf: 'flex-start', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: voice.recording ? C.red : C.line }}>
                <Text style={{ color: voice.recording ? C.red : C.text }}>{voice.recording ? `⏺ Stop ${mmss(voice.seconds)}` : voice.file ? `🎤 Recorded ${mmss(voice.seconds)} · again` : '🎤 Explain by voice'}</Text>
              </Pressable>
            </>
          )}
          <Row gap={10} style={{ marginTop: 12 }}>
            {rejecting === r.id
              ? <Button small variant="danger" title="Confirm reject" style={{ flex: 1 }} disabled={(!reason.trim() && !voice.file) || voice.recording || busy === r.id} onPress={() => act(r.id, false)} />
              : <Button small variant="danger" title="Reject" style={{ flex: 1 }} onPress={() => { setRejecting(r.id); setReason(''); }} />}
            <Button small title="Approve" style={{ flex: 1 }} loading={busy === r.id} onPress={() => act(r.id, true)} />
          </Row>
        </Card>
      )) : <Empty text="Nothing waiting for approval" />}
    </Screen>
  );
}
