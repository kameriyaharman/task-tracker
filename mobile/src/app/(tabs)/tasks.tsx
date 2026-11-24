import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { Chips, Empty, ErrorText, Loading, Screen, TaskCard } from '../../components/ui';
import { C } from '../../lib/theme';

export default function Tasks() {
  const { t, isManager } = useAuth();
  const params = useLocalSearchParams<{ filter?: string }>();
  const [scope, setScope] = useState('to_me');
  const [filter, setFilter] = useState(params.filter ?? 'today');
  const [q, setQ] = useState('');
  const [dept, setDept] = useState(0);
  const depts = useApi<any[]>('/departments');
  const { data, loading, error, reload } = useApi<any>('/tasks', { scope, filter: q ? 'all' : filter, q, department_id: dept || '' });
  const c = data?.counts ?? {};

  return (
    <Screen title={t('tasks')} refreshing={loading} onRefresh={reload}
      right={<Text style={{ color: C.gold, fontWeight: '600', fontSize: 15 }} onPress={() => router.push('/task/voice')}>🎤 {t('voice_note').split(' ')[0]}</Text>}>
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
        {([['to_me', t('to_me')], ['by_me', t('by_me')], ...(isManager ? [['team', t('team')]] : [])] as [string, string][]).map(([k, l]) => (
          <Text key={k} onPress={() => setScope(k)}
            style={{ flex: 1, textAlign: 'center', paddingVertical: 8, borderRadius: 9, overflow: 'hidden', backgroundColor: scope === k ? C.goldSoft : 'transparent', color: scope === k ? C.gold : C.text, fontWeight: scope === k ? '600' : '400' }}>{l}</Text>
        ))}
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="🔍 Search tasks…" placeholderTextColor="#B9A994" returnKeyType="search"
        style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: C.text }} />
      {isManager && (depts.data?.length ?? 0) > 0 && (
        <View style={{ marginBottom: 8 }}>
          <Chips items={[[0, 'All depts'], ...((depts.data ?? []).map((d) => [d.id, d.name]) as [number, string][])]} value={dept} onChange={(v: number) => setDept(v)} />
        </View>
      )}
      <Chips
        items={[['today', t('today'), c.today], ['overdue', t('overdue'), c.overdue], ['escalated', 'Escalated'], ['upcoming', t('upcoming'), c.upcoming], ...(scope !== 'to_me' ? [['approval', 'Waiting approval']] as any : []), ['done', t('done')], ['all', 'All']]}
        value={filter} onChange={setFilter}
      />
      <View style={{ height: 12 }} />
      <ErrorText msg={error} />
      {!data ? <Loading /> : data.items.length ? data.items.map((x: any) => <TaskCard key={x.id} t={x} />) : <Empty text={t('nothing_here')} />}
    </Screen>
  );
}
