import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { Card, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';
import { canErp, rs } from '../../lib/erp';

/** Showroom work hub: tiles depend on the person's ERP role. */
export default function ErpHome() {
  const { me, isManager } = useAuth();
  const perms = me?.erp_perms ?? {};
  const meta = useApi<any>('/erp/meta');
  const dash = useApi<any>(isManager || canErp(perms, 'reports') ? '/erp/dashboard' : null);
  const tiles: [string, string, string, boolean][] = [
    ['✅', 'Approvals', '/erp/approvals', isManager],
    ['🚚', 'My deliveries', '/erp/deliveries', canErp(perms, 'delivery')],
    ['📞', 'Udhari recovery', '/erp/recovery', canErp(perms, 'recovery')],
    ['📦', 'Stock check', '/erp/stock', canErp(perms, 'inventory') || canErp(perms, 'sales')],
    ['🏗️', 'Receive goods (GRN)', '/erp/receive', canErp(perms, 'inventory', true)],
    ['🧾', 'Add expense', '/erp/expense', true],
  ];
  return (
    <Screen back title="Showroom" refreshing={meta.loading} onRefresh={() => { meta.reload(); dash.reload(); }}>
      {me?.erp_role && <T muted style={{ marginBottom: 10 }}>Your role: {me.erp_role}</T>}
      {dash.data && (
        <Card style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
            {[['Sales today', rs(dash.data.sales_today)], ['Collected today', rs(dash.data.collection_today)], ['Udhari', rs(dash.data.receivable)], ['To deliver', String(dash.data.pending_deliveries)]].map(([l, v]) => (
              <View key={l} style={{ width: '45%' }}><T muted size={12}>{l}</T><T b size={18}>{v}</T></View>
            ))}
          </View>
        </Card>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {tiles.filter((t) => t[3]).map(([icon, label, path]) => (
          <Pressable key={path} onPress={() => router.push(path as any)} style={{ width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 18, borderWidth: 1, borderColor: '#EFE4D3' }}>
            <Text style={{ fontSize: 26 }}>{icon}</Text>
            <T b style={{ marginTop: 8 }}>{label}</T>
            {path === '/erp/approvals' && !!meta.data?.pending_approvals && <Text style={{ color: C.red, fontWeight: '700', marginTop: 2 }}>{meta.data.pending_approvals} waiting</Text>}
          </Pressable>
        ))}
      </View>
      <T muted size={12} style={{ marginTop: 16 }}>Billing, purchase orders, reports and settings are in the admin panel on computer.</T>
    </Screen>
  );
}
