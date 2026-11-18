import { useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { monthName, parseDate, sqlDate, timeOf } from '../lib/format';
import { Card, Empty, Loading, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

export default function Calendar() {
  const { t } = useAuth();
  const start = new Date(); start.setDate(start.getDate() - 1);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const [sel, setSel] = useState(sqlDate(new Date()));
  const { data } = useApi<any>('/calendar', { from: sqlDate(days[0]), to: sqlDate(days[13]) });
  const items = (data?.items ?? []).filter((x: any) => x.starts_at.startsWith(sel));

  return (
    <Screen back title={monthName(parseDate(`${sel} 00:00:00`)!)}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 16 }}>
        {days.map((d) => {
          const k = sqlDate(d);
          const on = k === sel;
          return (
            <Pressable key={k} onPress={() => setSel(k)} style={{ width: 52, paddingVertical: 10, borderRadius: 14, alignItems: 'center', backgroundColor: on ? C.indigo : '#fff', borderWidth: 1, borderColor: on ? C.indigo : C.line }}>
              <Text style={{ fontSize: 11, color: on ? '#fff' : C.muted }}>{d.toDateString().slice(0, 3)}</Text>
              <Text style={{ fontSize: 18, fontWeight: '700', color: on ? '#fff' : C.text }}>{d.getDate()}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      {!data ? <Loading /> : items.length ? items.map((x: any) => (
        <Pressable key={`${x.kind}${x.id}`} onPress={() => (x.kind === 'task' ? router.push(`/task/${x.id}`) : x.meet_link ? Linking.openURL(x.meet_link) : null)}>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 10 }}>
            <Text style={{ width: 54, color: C.muted, paddingTop: 12 }}>{timeOf(x.starts_at)}</Text>
            <Card style={{ flex: 1, backgroundColor: x.kind === 'event' ? C.indigoSoft : '#fff', borderLeftWidth: 3, borderLeftColor: x.kind === 'event' ? C.indigo : x.priority === 'high' ? C.red : C.amber }}>
              <T b>{x.title}</T>
              {x.meet_link && <T muted>Google Meet</T>}
              {x.kind === 'task' && <T muted>{t(x.status)}</T>}
            </Card>
          </View>
        </Pressable>
      )) : <Empty text={t('nothing_here')} />}
      {data?.gcal_connected && <T muted style={{ textAlign: 'center', marginTop: 10 }}>📅 {t('synced_gcal')}</T>}
    </Screen>
  );
}
