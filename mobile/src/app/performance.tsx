import { Text, View } from 'react-native';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { monthName } from '../lib/format';
import { Avatar, Card, Loading, Row, Screen, Section, T } from '../components/ui';
import { C } from '../lib/theme';

const medal = ['🥇', '🥈', '🥉'];

export default function Performance() {
  const { t, me } = useAuth();
  const { data, loading, reload } = useApi<any>('/performance/me');
  const s = data?.me;

  return (
    <Screen back title={t('performance')} refreshing={loading} onRefresh={reload}>
      {!data ? <Loading /> : (
        <>
          <View style={{ backgroundColor: C.navy, borderRadius: 20, padding: 20, alignItems: 'center' }}>
            <Text style={{ color: '#C9C7F5', fontSize: 11, letterSpacing: 1.5 }}>{t('your_score')} · {monthName(new Date()).toUpperCase()}</Text>
            <Text style={{ color: '#fff', fontSize: 56, fontWeight: '800', marginVertical: 4 }}>{s?.score ?? '—'}</Text>
            {s && <Text style={{ color: '#E2E0FF', fontSize: 13 }}>Rank #{s.rank} of {data.total}{s.rank <= 3 ? ' · 🏆 close to “Star of the Month”' : ''}</Text>}
          </View>
          {s && (
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              {[[`${s.on_time_pct}%`, t('on_time')], [s.tasks_done, t('done')], [`${s.attendance_pct}%`, t('attendance')], [s.rating, t('rating')]].map(([v, l]) => (
                <Card key={String(l)} style={{ flex: 1, alignItems: 'center', padding: 10 }}>
                  <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>{v}</Text><Text style={{ fontSize: 11, color: C.muted }}>{l}</Text>
                </Card>
              ))}
            </View>
          )}
          <Section title={t('leaderboard')}>
            <Card style={{ paddingVertical: 4 }}>
              {data.leaderboard.map((r: any, i: number) => (
                <Row key={r.user_id} style={{ paddingVertical: 10, borderBottomWidth: i < data.leaderboard.length - 1 ? 1 : 0, borderBottomColor: '#F2F1EC' }}>
                  <Avatar initials={r.initials} />
                  <T b={r.user_id === me?.id} style={{ flex: 1 }}>{r.name.split(' ')[0]}</T>
                  <T b>{r.score} pts {medal[i] ?? ''}</T>
                </Row>
              ))}
            </Card>
          </Section>
        </>
      )}
    </Screen>
  );
}
