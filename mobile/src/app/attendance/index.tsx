import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { hm, monthName, timeOf } from '../../lib/format';
import { Button, Card, Loading, Row, Screen, Section, T } from '../../components/ui';
import { C } from '../../lib/theme';

const dot: Record<string, string> = { present: C.green, late: '#F59E0B', field: C.indigo, leave: '#8B5CF6', absent: C.red, half_day: '#F59E0B' };

export default function MyAttendance() {
  const { t } = useAuth();
  const [m, setM] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const month = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
  const { data, loading, reload } = useApi<any>('/attendance/me', { month });
  const today = useApi<any>('/attendance/today');
  const byDay: Record<number, any> = {};
  data?.days.forEach((d: any) => (byDay[+d.work_date.slice(8, 10)] = d));
  const lead = (m.getDay() + 7) % 7;
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  const a = today.data?.attendance;

  return (
    <Screen back title={t('my_attendance')} refreshing={loading} onRefresh={reload}>
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 10 }}>
          <Text style={{ fontSize: 22, color: C.indigo }} onPress={() => setM(new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹</Text>
          <T b>{monthName(m)} {m.getFullYear()}</T>
          <Text style={{ fontSize: 22, color: C.indigo }} onPress={() => setM(new Date(m.getFullYear(), m.getMonth() + 1, 1))}>›</Text>
        </Row>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <Text key={i} style={{ width: '14.28%', textAlign: 'center', color: C.muted, fontSize: 12, marginBottom: 6 }}>{d}</Text>)}
          {Array.from({ length: lead }, (_, i) => <View key={`b${i}`} style={{ width: '14.28%' }} />)}
          {Array.from({ length: days }, (_, i) => {
            const rec = byDay[i + 1];
            const isToday = new Date().toDateString() === new Date(m.getFullYear(), m.getMonth(), i + 1).toDateString();
            return (
              <View key={i} style={{ width: '14.28%', alignItems: 'center', paddingVertical: 6 }}>
                <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? C.indigo : 'transparent' }}>
                  <Text style={{ color: isToday ? '#fff' : C.text }}>{i + 1}</Text>
                </View>
                <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: rec ? dot[rec.status] ?? 'transparent' : 'transparent' }} />
              </View>
            );
          })}
        </View>
      </Card>

      {!data ? <Loading /> : (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {[[data.summary.present, t('present'), C.green], [data.summary.late, t('late'), C.amber], [data.summary.leave, t('leave'), C.indigo], [`${data.summary.hours}h`, t('hours'), C.text]].map(([n, l, c]) => (
            <Card key={String(l)} style={{ flex: 1, alignItems: 'center', padding: 10 }}>
              <Text style={{ fontSize: 19, fontWeight: '700', color: c as string }}>{n}</Text><Text style={{ fontSize: 11, color: C.muted }}>{l}</Text>
            </Card>
          ))}
        </View>
      )}

      <Section title={t('today')}>
        <Card>
          {a?.punch_in_at ? (
            <>
              <Row style={{ justifyContent: 'space-between' }}><T muted>In</T><T b>{timeOf(a.punch_in_at)}</T></Row>
              <T muted style={{ marginVertical: 4 }}>{a.place ?? t(a.mode)}{a.has_selfie ? ' · selfie ✓' : ''}</T>
              <Row style={{ justifyContent: 'space-between' }}><T muted>{a.punch_out_at ? `Out ${timeOf(a.punch_out_at)}` : t('working')}</T><T b>{hm(a.worked_minutes)}</T></Row>
            </>
          ) : <Pressable onPress={() => router.push('/attendance/punch')}><T color={C.indigo}>{t('punch_in')} →</T></Pressable>}
        </Card>
      </Section>
      <Button title={t('apply_leave')} variant="ghost" style={{ marginTop: 16 }} onPress={() => router.push('/leave')} />
    </Screen>
  );
}
