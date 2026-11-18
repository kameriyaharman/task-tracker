import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { first } from '../lib/format';
import { Avatar, Button, Card, Empty, ErrorText, Loading, Row, Screen, T } from '../components/ui';

/** Manager inbox: leave, expense, deadline extension, punch regularisation. */
export default function Approvals() {
  const { t } = useAuth();
  const { data, loading, reload } = useApi<any[]>('/requests', { box: 'approvals', status: 'pending' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  const decide = async (id: number, d: 'approve' | 'reject') => {
    setBusy(id); setErr(null);
    try { await api(`/requests/${id}/${d}`, { body: {} }); await reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };

  return (
    <Screen back title={`${t('approvals')}${data ? ` (${data.length})` : ''}`} refreshing={loading} onRefresh={reload}>
      <ErrorText msg={err} />
      {!data ? <Loading /> : data.length ? data.map((r) => (
        <Card key={r.id} style={{ marginBottom: 10 }}>
          <Row>
            <Avatar initials={r.user_initials} size={36} />
            <T b style={{ flex: 1 }}>{first(r.user_name)}</T>
          </Row>
          <T style={{ marginTop: 8 }}>{r.summary}</T>
          {r.handover_name && <T muted>Tasks → {first(r.handover_name)}</T>}
          {r.reason && r.type !== 'expense' && <T muted>{r.reason}</T>}
          <Row gap={10} style={{ marginTop: 12 }}>
            <Button small variant="danger" title={t('reject')} style={{ flex: 1 }} onPress={() => decide(r.id, 'reject')} disabled={busy === r.id} />
            <Button small title={t('approve')} style={{ flex: 1 }} onPress={() => decide(r.id, 'approve')} loading={busy === r.id} />
          </Row>
        </Card>
      )) : <Empty text={t('all_caught_up')} />}
    </Screen>
  );
}
