import { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useApi } from '../../lib/hooks';
import { Card, Chips, Empty, Loading, Row, Screen, T } from '../../components/ui';
import { St, rs } from '../../lib/erp';

export default function MyDeliveries() {
  const [status, setStatus] = useState<'open' | 'delivered' | ''>('open');
  const { data, loading, reload } = useApi<any[]>('/erp/deliveries', { status, mine: 1 });
  return (
    <Screen back title="My deliveries" refreshing={loading} onRefresh={reload}>
      <Chips items={[['open', 'To deliver'], ['delivered', 'Done'], ['', 'All']]} value={status} onChange={setStatus} />
      <View style={{ height: 10 }} />
      {!data ? <Loading /> : data.length ? data.map((d) => (
        <Card key={d.id} style={{ marginBottom: 10 }} onPress={() => router.push(`/erp/delivery/${d.id}`)}>
          <Row><T b style={{ flex: 1 }}>{d.customer_name ?? 'Customer'}</T><St s={d.status} /></Row>
          <T muted>{d.address ?? 'No address'}</T>
          <T muted size={12}>{d.delivery_no} · bill {d.invoice_no}{d.payment_mode !== 'credit' && Number(d.paid_amount) < Number(d.invoice_total) ? ` · collect ${rs(Number(d.invoice_total) - Number(d.paid_amount))}` : ''}</T>
        </Card>
      )) : <Empty text="No deliveries" />}
    </Screen>
  );
}
