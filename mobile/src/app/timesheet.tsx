import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { hm, timeOf } from '../lib/format';
import { Button, Card, Chips, Empty, ErrorText, Input, Loading, Row, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

export default function Timesheet() {
  const { t } = useAuth();
  const { data, loading, reload, setData } = useApi<any>('/timesheet');
  const [title, setTitle] = useState('');
  const [cat, setCat] = useState('Office');
  const [err, setErr] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(id); }, []);

  const run = async (path: string, body: any = {}) => {
    setErr(null);
    try { setData(await api(path, { body })); setTitle(''); } catch (e) { setErr((e as Error).message); }
  };
  const running = data?.entries.find((e: any) => !e.ended_at);

  return (
    <Screen back title={`${t('timesheet')} · ${t('today').toLowerCase()}`} refreshing={loading} onRefresh={reload}>
      <ErrorText msg={err} />
      {!data ? <Loading /> : (
        <>
          {data.entries.length ? data.entries.map((e: any) => (
            <Card key={e.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: e.ended_at ? C.indigo : C.green }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <View style={{ flex: 1 }}>
                  <T b>{e.title}</T>
                  <T muted>{e.category ?? ''} · {timeOf(e.started_at)}–{e.ended_at ? timeOf(e.ended_at) : 'now'}</T>
                </View>
                <T b color={e.ended_at ? C.text : C.green}>{hm(e.minutes)}</T>
              </Row>
            </Card>
          )) : <Empty text={t('nothing_here')} />}

          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
            <Card style={{ flex: 1 }}><T muted>{t('total')}</T><Text style={{ fontSize: 20, fontWeight: '700' }}>{hm(data.total_minutes)}</Text></Card>
            <Card style={{ flex: 1 }}><T muted>{t('billable')}</T><Text style={{ fontSize: 20, fontWeight: '700', color: C.green }}>{hm(data.billable_minutes)}</Text></Card>
          </View>

          {running ? (
            <Button title={`${t('stop_timer')} · ${running.title}`} variant="danger" onPress={() => run('/timesheet/stop')} />
          ) : (
            <>
              <Input label="What are you working on?" value={title} onChangeText={setTitle} placeholder="Lead follow-ups" />
              <Chips items={[['Office', 'Office'], ['Field', 'Field'], ['Sales', 'Sales'], ['Meeting', 'Meeting']]} value={cat} onChange={setCat} />
              <Button title={`▶ ${t('start_timer')}`} style={{ marginTop: 12 }} disabled={!title} onPress={() => run('/timesheet/start', { title, category: cat })} />
            </>
          )}
        </>
      )}
    </Screen>
  );
}
