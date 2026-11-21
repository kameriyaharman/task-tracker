import { useState } from 'react';
import { useApi } from '../../lib/hooks';
import { Card, Chips, Empty, Input, Loading, Row, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';
import { qty, rs } from '../../lib/erp';

export default function StockCheck() {
  const [q, setQ] = useState('');
  const [low, setLow] = useState<'all' | 'low'>('all');
  const { data, loading, reload } = useApi<any[]>('/erp/stock', { q, low: low === 'low' ? 1 : '' });
  return (
    <Screen back title="Stock" refreshing={loading} onRefresh={reload}>
      <Input placeholder="Search item, SKU or barcode" value={q} onChangeText={setQ} autoCapitalize="none" />
      <Chips items={[['all', 'All items'], ['low', 'Low stock']]} value={low} onChange={setLow} />
      <T muted size={12} style={{ marginVertical: 6 }}>Quantity is total of all godowns.</T>
      {!data ? <Loading /> : data.length ? data.map((p) => (
        <Card key={p.id} style={{ marginBottom: 8 }}>
          <Row>
            <T b style={{ flex: 1 }}>{p.name}</T>
            <T b color={p.low ? C.red : undefined}>{qty(p.qty)} {p.unit}</T>
          </Row>
          <T muted size={12}>{[p.sku, p.category_name, p.rack && `Rack ${p.rack}`].filter(Boolean).join(' · ')}{Number(p.pending_delivery) ? ` · ${qty(p.pending_delivery)} to deliver` : ''} · MRP {rs(p.retail_price)}</T>
        </Card>
      )) : <Empty text="No items" />}
    </Screen>
  );
}
