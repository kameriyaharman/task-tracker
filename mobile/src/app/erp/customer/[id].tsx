import { useState } from 'react';
import { Linking, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { useAuth } from '../../../lib/auth';
import { Button, Card, Chips, DateField, ErrorText, Input, Loading, Row, Screen, T } from '../../../components/ui';
import { dateOf, sqlDate } from '../../../lib/format';
import { canErp, d8, rs } from '../../../lib/erp';

const OUT: [string, string][] = [['called', 'Called'], ['promise', 'Will pay'], ['no_response', 'No answer'], ['dispute', 'Dispute']];

export default function CustomerRecovery() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me } = useAuth();
  const st = useApi<any>('/erp/statement', { party: 'customer', id });
  const log = useApi<any[]>('/erp/recovery', { customer_id: id });
  const [tab, setTab] = useState<'followup' | 'payment'>('followup');
  const [outcome, setOutcome] = useState('called');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [mode, setMode] = useState('cash');
  const [ref, setRef] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!st.data) return <Screen back title="Customer"><Loading /></Screen>;
  const c = st.data.party;
  const run = async (fn: () => Promise<any>) => {
    setBusy(true); setErr(null);
    try { await fn(); setNote(''); setAmount(''); setRef(''); setDate(''); st.reload(); log.reload(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const quickDates: [string, string][] = [1, 2, 3, 7].map((n) => { const d = new Date(Date.now() + n * 86400000); return [sqlDate(d), n === 1 ? 'Tomorrow' : `${d.toLocaleDateString('en-IN', { weekday: 'short' })} ${dateOf(d).slice(0, 5)}`]; });
  return (
    <Screen back title={c.name} refreshing={st.loading} onRefresh={st.reload}>
      <ErrorText msg={err} />
      <Card>
        <T muted>Balance due</T>
        <T b size={26}>{rs(st.data.closing)}</T>
        <Row style={{ marginTop: 10 }}>
          {c.mobile && <Button small title={`📞 Call ${c.mobile}`} onPress={() => Linking.openURL(`tel:${c.mobile}`)} style={{ flex: 1 }} />}
          {c.mobile && <Button small variant="ok" title="WhatsApp" style={{ flex: 1 }}
            onPress={() => Linking.openURL(`https://wa.me/91${c.mobile}?text=${encodeURIComponent(`Namaste ${c.name}, ${me?.company_name ?? ''} ka ${rs(st.data.closing)} baaki hai. Kripya payment kar dijiye. Dhanyavaad.`)}`)} />}
        </Row>
      </Card>
      <View style={{ marginTop: 12 }}><Chips items={[['followup', 'Log follow-up'], ['payment', 'Got payment']]} value={tab} onChange={setTab} /></View>
      <Card style={{ marginTop: 10 }}>
        {tab === 'followup' ? (
          <>
            <Chips items={OUT} value={outcome} onChange={setOutcome} />
            {outcome === 'promise' && (
              <>
                <T muted size={12} style={{ marginTop: 10 }}>Will pay on</T>
                <Chips items={quickDates} value={date} onChange={setDate} />
                <DateField label="Or date" value={date} onChange={setDate} />
                <Input label="Amount" keyboardType="numeric" value={amount} onChangeText={setAmount} />
              </>
            )}
            <Input label="Note" value={note} onChangeText={setNote} />
            <Button title="Save" loading={busy} disabled={outcome === 'promise' && !date} style={{ marginTop: 6 }}
              onPress={() => run(() => api('/erp/recovery', { body: { customer_id: id, outcome, promise_date: date || undefined, promise_amount: amount || undefined, note } }))} />
            {outcome === 'promise' && <T muted size={12} style={{ marginTop: 6 }}>A reminder task is created for that day.</T>}
          </>
        ) : canErp(me?.erp_perms, 'recovery', true) || canErp(me?.erp_perms, 'accounts', true) ? (
          <>
            <Input label="Amount received" keyboardType="numeric" value={amount} onChangeText={setAmount} />
            <Chips items={[['cash', 'Cash'], ['upi', 'UPI'], ['cheque', 'Cheque'], ['bank', 'Bank']]} value={mode} onChange={setMode} />
            <Input label="UTR / cheque no." value={ref} onChangeText={setRef} />
            <Button title="Save payment" variant="ok" loading={busy} disabled={!(Number(amount) > 0)} style={{ marginTop: 6 }}
              onPress={() => run(() => api('/erp/payments', { body: { direction: 'in', party_id: id, amount, mode, reference: ref } }))} />
          </>
        ) : <T muted>You can't record payments.</T>}
      </Card>
      <T b style={{ marginTop: 16, marginBottom: 6 }}>History</T>
      {(log.data ?? []).slice(0, 15).map((x) => (
        <Card key={x.id} style={{ marginBottom: 6 }}>
          <Row><T style={{ flex: 1 }}>{x.outcome.replace('_', ' ')}{x.promise_date ? ` → ${rs(x.promise_amount)} on ${d8(x.promise_date)}` : ''}</T><T muted size={12}>{d8(x.created_at)}</T></Row>
          {x.note ? <T muted size={12}>{x.note} · {x.by_name}</T> : <T muted size={12}>{x.by_name}</T>}
        </Card>
      ))}
      <Button variant="ghost" small title="Back to list" style={{ marginTop: 10 }} onPress={() => router.back()} />
      <View style={{ height: 30 }} />
    </Screen>
  );
}
