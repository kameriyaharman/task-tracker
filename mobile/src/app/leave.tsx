import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { dateOf, sqlDate } from '../lib/format';
import { Picker } from '../components/Picker';
import { Badge, Button, Card, ErrorText, Input, Row, Screen, Section, Select, T } from '../components/ui';
import { C } from '../lib/theme';

export default function ApplyLeave() {
  const { t } = useAuth();
  const bal = useApi<any[]>('/leave/balance');
  const mine = useApi<any[]>('/requests', { box: 'mine', type: 'leave' });
  const people = useApi<any[]>('/employees');
  const [type, setType] = useState<number | null>(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 1); return d; });
  const [days, setDays] = useState(1);
  const [reason, setReason] = useState('');
  const [handover, setHandover] = useState<number | null>(null);
  const [picker, setPicker] = useState<null | 'type' | 'handover'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const to = new Date(from); to.setDate(from.getDate() + days - 1);
  const lt = bal.data?.find((b) => b.id === type) ?? bal.data?.[0];
  const label: Record<string, string> = { casual: t('casual'), sick: t('sick'), earned: t('earned'), compoff: t('comp_off') };

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api('/requests', { body: { type: 'leave', leave_type_id: lt.id, from_date: sqlDate(from), to_date: sqlDate(to), reason, handover_to: handover } });
      router.back();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const Step = ({ label: l, value, onMinus, onPlus }: any) => (
    <Card style={{ flex: 1, padding: 10 }}>
      <T muted>{l}</T>
      <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontSize: 22, color: C.gold }} onPress={onMinus}>−</Text><T b>{value}</T><Text style={{ fontSize: 22, color: C.gold }} onPress={onPlus}>+</Text>
      </Row>
    </Card>
  );

  return (
    <Screen back title={t('apply_leave')}>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {(bal.data ?? []).map((b) => (
          <Pressable key={b.id} onPress={() => setType(b.id)} style={{ flex: 1 }}>
            <Card style={{ alignItems: 'center', padding: 10, borderColor: lt?.id === b.id ? C.gold : '#EDE3D4', borderWidth: 1.5 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: C.text }}>{b.left ?? b.used}</Text>
              <Text style={{ fontSize: 11, color: C.muted }}>{label[b.code] ?? b.name}</Text>
            </Card>
          </Pressable>
        ))}
      </View>
      <View style={{ height: 14 }} />
      <ErrorText msg={err} />
      <Select label={t('type')} value={lt?.name ?? '—'} onPress={() => setPicker('type')} />
      <Row gap={8} style={{ marginBottom: 10 }}>
        <Step label="From" value={dateOf(from)} onMinus={() => { const d = new Date(from); d.setDate(d.getDate() - 1); setFrom(d); }} onPlus={() => { const d = new Date(from); d.setDate(d.getDate() + 1); setFrom(d); }} />
        <Step label="Days" value={`${days} · to ${dateOf(to)}`} onMinus={() => setDays(Math.max(1, days - 1))} onPlus={() => setDays(days + 1)} />
      </Row>
      <Input label={t('reason')} value={reason} onChangeText={setReason} placeholder="Family function" />
      <Select label={t('hand_over')} value={people.data?.find((p) => p.id === handover)?.name ?? '—'} onPress={() => setPicker('handover')} />
      <Button title={t('send_for_approval')} onPress={submit} loading={busy} disabled={!lt} />

      {mine.data && mine.data.length > 0 && (
        <Section title="My requests">
          {mine.data.map((r) => (
            <Card key={r.id} style={{ marginBottom: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}><T>{r.summary}</T><Badge s={r.status} label={r.status} /></Row>
            </Card>
          ))}
        </Section>
      )}

      <Picker visible={picker === 'type'} title={t('type')} onClose={() => setPicker(null)} onPick={setType}
        options={(bal.data ?? []).map((b) => ({ value: b.id, label: b.name, sub: b.left !== null ? `${b.left} left` : 'On approval' }))} />
      <Picker visible={picker === 'handover'} title={t('hand_over')} search onClose={() => setPicker(null)} onPick={setHandover}
        options={(people.data ?? []).map((p) => ({ value: p.id, label: p.name, initials: p.initials }))} />
    </Screen>
  );
}
