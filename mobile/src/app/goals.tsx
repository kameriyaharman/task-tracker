import { dateOf } from '../lib/format';
import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { C } from '../lib/theme';
import { useApi } from '../lib/hooks';
import { Badge, Bar, Button, Card, Empty, ErrorText, Input, Loading, Row, Screen, T } from '../components/ui';

const money = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(1)} Cr` : v >= 1e5 ? `₹${(v / 1e5).toFixed(1)} L` : `₹${v}`);

export default function Goals() {
  const { t } = useAuth();
  const { data, loading, reload } = useApi<any[]>('/goals');
  const [open, setOpen] = useState<number | null>(null);
  const [add, setAdd] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const save = async (id: number) => {
    setErr(null);
    try { await api(`/goals/${id}/progress`, { body: { add: +add, note } }); setOpen(null); setAdd(''); setNote(''); reload(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Screen back title={t('goals')} refreshing={loading} onRefresh={reload}>
      <T muted style={{ marginBottom: 10 }}>Target = the number to reach (deals, ₹ sales, bags…). 100% = target reached. Tap a goal to add what you achieved.</T>
      <ErrorText msg={err} />
      {!data ? <Loading /> : data.length ? data.map((g) => (
        <Card key={g.id} style={{ marginBottom: 10 }} onPress={() => setOpen(open === g.id ? null : g.id)}>
          <Row style={{ justifyContent: 'space-between' }}>
            <T b size={15} style={{ flex: 1 }}>{g.unit === '₹' ? `Revenue ${money(+g.target_value)}` : g.title}</T>
            <T b>{g.progress_pct}%</T>
          </Row>
          <Row style={{ justifyContent: 'space-between', marginVertical: 6 }}>
            <T muted>{g.scope_label}{g.period_label ? ` · ${g.period_label}` : ''}</T>
            <Badge s={g.status} label={g.status.replace('_', ' ')} />
          </Row>
          <Bar pct={g.progress_pct} />
          <T muted style={{ marginTop: 6 }}>{g.measure === 'tasks' ? `${g.tasks_done} of ${g.tasks_total} tasks done` : `${g.unit === '₹' ? money(+g.current_value) : Math.round(+g.current_value)} of ${g.unit === '₹' ? money(+g.target_value) : `${Math.round(+g.target_value)} ${g.unit ?? ''}`}`}{g.expected_pct !== null ? ` · should be ${g.expected_pct}% by today` : ''}</T>
          {open === g.id && g.measure !== 'tasks' && (
            <>
              <Row gap={8} style={{ marginTop: 10 }}>
                <Input style={{ flex: 1 }} keyboardType="numeric" value={add} onChangeText={setAdd} placeholder={`+ achieved (${g.unit || 'number'})`} />
                <Input style={{ flex: 2 }} value={note} onChangeText={setNote} placeholder="Note" />
              </Row>
              <Button small title="Add progress" disabled={!add} onPress={() => save(g.id)} />
            </>
          )}
          {open === g.id && g.updates?.map((u: any, i: number) => <Text key={i} style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{dateOf(u.created_at)} · {u.user_name.split(' ')[0]} +{u.added}{u.note ? ` · ${u.note}` : ''}</Text>)}
        </Card>
      )) : <Empty text={t('nothing_here')} />}
    </Screen>
  );
}
