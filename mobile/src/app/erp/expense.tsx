import { useState } from 'react';
import { Image, View } from 'react-native';
import { api, form, type UploadFile } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { takePhoto } from '../../components/media';
import { Button, Card, Chips, ErrorText, Input, Row, Screen, T } from '../../components/ui';
import { St, d8, rs } from '../../lib/erp';

export default function AddExpense() {
  const list = useApi<any>('/erp/expenses');
  const cats: string[] = list.data?.categories ?? ['Transport / freight', 'Labour', 'Fuel', 'Other'];
  const [cat, setCat] = useState('Labour');
  const [amount, setAmount] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [mode, setMode] = useState('cash');
  const [note, setNote] = useState('');
  const [bills, setBills] = useState<UploadFile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null); setOk(null);
    try {
      const r = await api('/erp/expenses', { body: form({ category: cat, amount, paid_to: paidTo, mode, notes: note }, { bills }) });
      setOk(r.status === 'approved' ? 'Saved' : 'Sent for approval');
      setAmount(''); setPaidTo(''); setNote(''); setBills([]); list.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen back title="Expense" refreshing={list.loading} onRefresh={list.reload}>
      <ErrorText msg={err} />
      {ok && <T color="#2E7D4F" b style={{ marginBottom: 8 }}>✓ {ok}</T>}
      <Card>
        <Chips items={cats.map((c) => [c, c] as [string, string])} value={cat} onChange={setCat} />
        <Input label="Amount (₹)" keyboardType="numeric" value={amount} onChangeText={setAmount} style={{ marginTop: 10 }} />
        <Input label="Paid to" value={paidTo} onChangeText={setPaidTo} />
        <Chips items={[['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank']]} value={mode} onChange={setMode} />
        <Input label="Note" value={note} onChangeText={setNote} style={{ marginTop: 10 }} />
        <Row style={{ flexWrap: 'wrap' }}>
          {bills.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />)}
          <Button small variant="ghost" title="📷 Bill photo" onPress={async () => { const p = await takePhoto(); if (p) setBills([...bills, p]); }} />
        </Row>
        <Button title="Save expense" loading={busy} disabled={!(Number(amount) > 0)} style={{ marginTop: 12 }} onPress={save} />
      </Card>
      <T b style={{ marginTop: 16, marginBottom: 6 }}>My expenses</T>
      {(list.data?.items ?? []).slice(0, 20).map((e: any) => (
        <Card key={e.id} style={{ marginBottom: 6 }}>
          <Row><T style={{ flex: 1 }}>{e.category}{e.paid_to ? ` · ${e.paid_to}` : ''}</T><T b>{rs(e.amount)}</T></Row>
          <Row><T muted size={12} style={{ flex: 1 }}>{d8(e.exp_date)} · {e.mode}</T><St s={e.status} /></Row>
        </Card>
      ))}
      <View style={{ height: 30 }} />
    </Screen>
  );
}
