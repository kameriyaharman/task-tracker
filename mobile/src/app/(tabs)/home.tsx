import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { dayDate, first, hm, timeOf } from '../../lib/format';
import { Brand, Button, Card, Empty, ErrorText, Loading, Row, Screen, Section, T, TaskCard } from '../../components/ui';
import { C } from '../../lib/theme';

export default function Home() {
  const { t, isManager } = useAuth();
  const { data, loading, error, reload } = useApi<any>('/home');
  const a = data?.attendance;
  const punchedIn = a?.is_punched_in;

  const shortcuts: [string, string, string][] = [
    ['🗓', t('my_attendance'), '/attendance'], ['🏖', t('apply_leave'), '/leave'], ['⏱', t('timesheet'), '/timesheet'], ['📅', t('calendar'), '/calendar'],
    ['🎯', t('goals'), '/goals'], ['🏆', t('performance'), '/performance'],
    ...(isManager ? ([['✅', t('approvals'), '/approvals'], ['📍', t('team_location'), '/team-map'], ['✨', t('ai_suggestions'), '/ai']] as [string, string, string][]) : []),
  ];

  return (
    <Screen refreshing={loading} onRefresh={reload}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 14 }}>
        <Brand />
        <Pressable onPress={() => router.push('/notifications')} hitSlop={10}>
          <Text style={{ fontSize: 20 }}>🔔</Text>
          {!!data?.unread_notifications && (
            <View style={{ position: 'absolute', top: -4, right: -6, backgroundColor: C.gold, borderRadius: 9, paddingHorizontal: 5 }}>
              <Text style={{ color: '#fff', fontSize: 10 }}>{data.unread_notifications}</Text>
            </View>
          )}
        </Pressable>
      </Row>
      <ErrorText msg={error} />
      {!data ? <Loading /> : (
        <>
          <T b size={22}>{t('hi')} {first(data.user.name)} 👋</T>
          <T muted>{dayDate(new Date())}</T>

          <View style={{ backgroundColor: C.walnut, borderRadius: 18, padding: 16, marginTop: 14, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#E6CFA3', fontSize: 10.5, letterSpacing: 1 }}>{a?.punch_in_at ? t('punched_in') : t('not_punched')}</Text>
              {a?.punch_in_at ? (
                <>
                  <Text style={{ color: '#fff', fontSize: 26, fontWeight: '700', marginVertical: 2 }}>{timeOf(a.punch_in_at)}</Text>
                  <Text style={{ color: '#E6CFA3', fontSize: 12 }}>{a.place ?? t(a.mode)} · {hm(a.worked_minutes)} {t('today_hours')}</Text>
                </>
              ) : <Text style={{ color: '#fff', fontSize: 16, marginTop: 6 }}>{a?.status === 'leave' ? t('leave') : '—'}</Text>}
            </View>
            {a?.status !== 'leave' && (!a?.punch_out_at) && (
              <Button variant="white" small title={punchedIn ? t('punch_out') : t('punch_in')} onPress={() => router.push(punchedIn ? '/attendance/punch?out=1' : '/attendance/punch')} />
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            {[[data.counts.today, t('today'), C.text, 'today'], [data.counts.overdue, t('overdue'), C.red, 'overdue'], [data.counts.upcoming, t('upcoming'), C.text, 'upcoming'], [`${data.counts.on_time_pct}%`, t('on_time'), C.green, 'done']].map(([n, l, color, f]) => (
              <Card key={String(l)} style={{ flex: 1, alignItems: 'center', padding: 10 }} onPress={() => router.push(`/tasks?filter=${f}`)}>
                <Text style={{ fontSize: 20, fontWeight: '700', color: color as string }}>{n}</Text>
                <Text style={{ fontSize: 11, color: C.muted }}>{l}</Text>
              </Card>
            ))}
          </View>

          <Section title={t('todays_tasks')} right={<Text style={{ color: C.gold, fontWeight: '600' }} onPress={() => router.push('/tasks')}>{t('see_all')}</Text>}>
            {data.tasks.length ? data.tasks.map((x: any) => <TaskCard key={x.id} t={x} />) : <Empty text={t('nothing_here')} />}
          </Section>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, marginTop: 8 }}>
            {shortcuts.map(([g, l, href]) => (
              <Card key={href} onPress={() => router.push(href as any)} style={{ width: 96, alignItems: 'center', paddingVertical: 14 }}>
                <Text style={{ fontSize: 22 }}>{g}</Text>
                <Text style={{ fontSize: 11.5, color: C.text, textAlign: 'center', marginTop: 6 }} numberOfLines={2}>{l}</Text>
              </Card>
            ))}
          </ScrollView>
        </>
      )}
    </Screen>
  );
}
