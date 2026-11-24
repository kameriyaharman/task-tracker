import { useState } from 'react';
import { Text } from 'react-native';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Picker } from '../components/Picker';
import { Button, Card, ErrorText, Input, Row, Screen, Section, Select, T } from '../components/ui';
import { C } from '../lib/theme';

/** Going on leave / emergency: hand all my open tasks to a colleague (and take them back later). */
export default function Handover() {
  const { me, isManager } = useAuth();
  const people = useApi<any[]>('/employees');
  const hist = useApi<any[]>('/tasks/handovers');
  const [from, setFrom] = useState<number | null>(me?.id ?? null);
  const [to, setTo] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [pick, setPick] = useState<null | 'from' | 'to'>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const name = (id: number | null) => people.data?.find((p) => p.id === id)?.name ?? '';

  const go = async () => {
    setErr(null); setMsg(null);
    if (!to) return setErr('Choose who will take over');
    setBusy(true);
    try { const r = await api<any>('/tasks/handover', { body: { from_user: from, to_user: to, note } }); setMsg(`✓ ${r.moved} open tasks moved to ${r.to}`); hist.reload(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen back title="Hand over tasks" onRefresh={hist.reload}>
      <T muted style={{ marginBottom: 12 }}>Going on leave or have an emergency? All open tasks move to the colleague you choose. You can take them back later.</T>
      <ErrorText msg={err} />
      {msg && <Text style={{ color: C.green, marginBottom: 10, fontWeight: '600' }}>{msg}</Text>}
      {isManager && <Select label="Whose tasks" value={name(from) || '—'} onPress={() => setPick('from')} />}
      <Select label="Hand over to *" value={to ? name(to) : 'Tap to choose'} onPress={() => setPick('to')} />
      <Input label="Reason" value={note} onChangeText={setNote} placeholder="On leave till 30 Nov" />
      <Button title="Hand over all open tasks" onPress={go} loading={busy} />

      <Section title="History">
        {(hist.data ?? []).map((h) => (
          <Card key={h.id} style={{ marginBottom: 8 }}>
            <T>{h.from_name.split(' ')[0]} → {h.to_name.split(' ')[0]} · {h.task_count} tasks</T>
            <Row style={{ justifyContent: 'space-between', marginTop: 4 }}>
              <T muted>{h.created_at.slice(0, 10)}{h.note ? ` · ${h.note}` : ''}</T>
              {h.returned_at ? <T muted>returned</T> : (
                <Text style={{ color: C.gold, fontWeight: '600' }} onPress={() => api<any>(`/tasks/handovers/${h.id}/return`, { body: {} }).then((r) => { setMsg(`✓ ${r.returned} tasks handed back`); hist.reload(); }).catch((e) => setErr(e.message))}>Hand back</Text>
              )}
            </Row>
          </Card>
        ))}
      </Section>

      <Picker visible={!!pick} title={pick === 'from' ? 'Whose tasks' : 'Hand over to'} search onClose={() => setPick(null)} onPick={(id) => (pick === 'from' ? setFrom(id) : setTo(id))}
        options={(people.data ?? []).filter((p) => pick === 'from' || p.id !== from).map((p) => ({ value: p.id, label: p.name, sub: p.department_name ?? '', initials: p.initials }))} />
    </Screen>
  );
}
