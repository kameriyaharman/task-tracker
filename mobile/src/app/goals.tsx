import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Badge, Bar, Card, Empty, Loading, Row, Screen, T } from '../components/ui';

const money = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(1)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${v}`);

export default function Goals() {
  const { t } = useAuth();
  const { data, loading, reload } = useApi<any[]>('/goals');
  return (
    <Screen back title={t('goals')} refreshing={loading} onRefresh={reload}>
      {!data ? <Loading /> : data.length ? data.map((g) => (
        <Card key={g.id} style={{ marginBottom: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T b size={15} style={{ flex: 1 }}>{g.unit === '₹' ? `Revenue ${money(+g.target_value)}` : g.title}</T>
            <T b>{g.progress_pct}%</T>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginVertical: 6 }}>
            <T muted>{g.scope_label}{g.period_label ? ` · ${g.period_label}` : ''}</T>
            <Badge s={g.status} label={g.status.replace('_', ' ')} />
          </Row>
          <Bar pct={g.progress_pct} />
        </Card>
      )) : <Empty text={t('nothing_here')} />}
    </Screen>
  );
}
