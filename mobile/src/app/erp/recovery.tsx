import { useState } from 'react';
import { router } from 'expo-router';
import { useApi } from '../../lib/hooks';
import { Card, Empty, Input, Loading, Row, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';
import { d8, rs } from '../../lib/erp';

export default function RecoveryList() {
  const { data, loading, reload } = useApi<any[]>('/erp/recovery/my');
  const [q, setQ] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const rows = (data ?? []).filter((c) => !q || `${c.name} ${c.mobile ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const total = rows.reduce((s, c) => s + Number(c.outstanding), 0);
  return (
    <Screen back title="Udhari recovery" refreshing={loading} onRefresh={reload}>
      <Input placeholder="Search customer" value={q} onChangeText={setQ} />
      <T muted style={{ marginVertical: 8 }}>{rows.length} customers · total {rs(total)}</T>
      {!data ? <Loading /> : rows.length ? rows.map((c) => {
        const late = c.oldest_due && c.oldest_due < today;
        const f = c.last_followup;
        return (
          <Card key={c.id} style={{ marginBottom: 10 }} onPress={() => router.push(`/erp/customer/${c.id}`)}>
            <Row><T b style={{ flex: 1 }}>{c.name}</T><T b color={late ? C.red : undefined}>{rs(c.outstanding)}</T></Row>
            <T muted size={12}>{c.mobile ?? ''}{c.oldest_due ? ` · due ${d8(c.oldest_due)}` : ''}{late ? ' · overdue' : ''}</T>
            {f && <T muted size={12}>Last: {f.outcome.replace('_', ' ')}{f.promise_date ? ` → ${rs(f.promise_amount)} on ${d8(f.promise_date)}` : ''}</T>}
          </Card>
        );
      }) : <Empty text="No dues 🎉" />}
    </Screen>
  );
}
