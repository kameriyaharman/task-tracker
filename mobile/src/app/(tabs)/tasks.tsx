import { useState } from 'react';
import { Text, View } from 'react-native';
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
  const { data, loading, error, reload } = useApi<any>('/tasks', { scope, filter });
  const c = data?.counts ?? {};

  return (
    <Screen title={t('tasks')} refreshing={loading} onRefresh={reload}
      right={<Text style={{ color: C.indigo, fontWeight: '600', fontSize: 15 }} onPress={() => router.push('/task/voice')}>🎤 {t('voice_note').split(' ')[0]}</Text>}>
      <View style={{ flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, marginBottom: 12, borderWidth: 1, borderColor: C.line }}>
        {([['to_me', t('to_me')], ['by_me', t('by_me')], ...(isManager ? [['team', t('team')]] : [])] as [string, string][]).map(([k, l]) => (
          <Text key={k} onPress={() => setScope(k)}
            style={{ flex: 1, textAlign: 'center', paddingVertical: 8, borderRadius: 9, overflow: 'hidden', backgroundColor: scope === k ? C.indigoSoft : 'transparent', color: scope === k ? C.indigo : C.text, fontWeight: scope === k ? '600' : '400' }}>{l}</Text>
        ))}
      </View>
      <Chips
        items={[['today', t('today'), c.today], ['overdue', t('overdue'), c.overdue], ['upcoming', t('upcoming'), c.upcoming], ['done', t('done')], ['all', 'All']]}
        value={filter} onChange={setFilter}
      />
      <View style={{ height: 12 }} />
      <ErrorText msg={error} />
      {!data ? <Loading /> : data.items.length ? data.items.map((x: any) => <TaskCard key={x.id} t={x} />) : <Empty text={t('nothing_here')} />}
    </Screen>
  );
}
