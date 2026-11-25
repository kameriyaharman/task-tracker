import { useState } from 'react';
import { Image, Pressable, Switch, Text, View } from 'react-native';
import { api, form, type UploadFile } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { takePhoto } from '../../components/media';
import { Button, Card, Chips, ErrorText, Input, Row, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';
import { St, d8, rs } from '../../lib/erp';

const STATUS: Record<string, string> = { pending_verification: 'With accounts', pending_approval: 'With boss', approved: 'Approved', rejected: 'Rejected' };

/** Expense / mileage claim → accounts verify → boss approve. Advance balance and trips on top. */
export default function AddExpense() {
  const list = useApi<any>('/erp/expenses', { user_id: '' });
  const adv = useApi<any>('/erp/advances');
  const trips = useApi<any[]>('/erp/trips');
  const vehicles = useApi<any[]>('/erp/vehicles');
  const cats: string[] = list.data?.categories ?? [];
  const [kind, setKind] = useState<'expense' | 'mileage'>('expense');
  const [cat, setCat] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [paidTo, setPaidTo] = useState('');
  const [mode, setMode] = useState('cash');
  const [reimburse, setReimburse] = useState(true);
  const [trip, setTrip] = useState<number | null>(null);
  const [vehicle, setVehicle] = useState<number | null>(null);
  const [odoS, setOdoS] = useState(''); const [odoE, setOdoE] = useState(''); const [km, setKm] = useState('');
  const [gps, setGps] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [bills, setBills] = useState<UploadFile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const myVehicles = (vehicles.data ?? []).filter((v) => +v.is_active);
  const veh = myVehicles.find((v) => v.id === vehicle);
  const kmVal = odoS && odoE ? Number(odoE) - Number(odoS) : Number(km) || 0;
  const wallet = (adv.data?.wallets ?? [])[0];
  const openTrips = (trips.data ?? []).filter((t) => t.status === 'approved');

  const save = async () => {
    setBusy(true); setErr(null); setOk(null);
    try {
      const fields: Record<string, any> = kind === 'mileage'
        ? { kind, vehicle_id: vehicle, odo_start: odoS || undefined, odo_end: odoE || undefined, km: odoS && odoE ? undefined : km, gps_km: gps ?? undefined, notes: note, trip_id: trip ?? undefined }
        : { kind, category: cat, amount, merchant, paid_to: paidTo, mode, reimburse: reimburse ? 1 : 0, notes: note, trip_id: trip ?? undefined };
      await api('/erp/expenses', { body: form(fields, { bills }) });
      setOk('Sent to accounts for checking');
      setAmount(''); setPaidTo(''); setMerchant(''); setNote(''); setBills([]); setOdoS(''); setOdoE(''); setKm(''); setGps(null);
      list.reload(); adv.reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen back title="Expenses" refreshing={list.loading} onRefresh={() => { list.reload(); adv.reload(); trips.reload(); }}>
      {wallet && (
        <Card style={{ marginBottom: 10, backgroundColor: wallet.balance < -0.5 ? '#FFF6F5' : '#F4FBF6' }}>
          <T b>{wallet.label}</T>
          <T muted size={12}>Advance {rs(wallet.advances)} · approved claims {rs(wallet.claims)} · waiting {rs(wallet.pending_claims)}</T>
        </Card>
      )}
      <ErrorText msg={err} />
      {ok && <T color="#2E7D4F" b style={{ marginBottom: 8 }}>✓ {ok}</T>}
      <Card>
        <Chips items={[['expense', '🧾 Expense / bill'], ['mileage', '🛵 Mileage (km)']]} value={kind} onChange={setKind} />
        <View style={{ height: 10 }} />
        {kind === 'mileage' ? (
          <>
            <T muted style={{ marginBottom: 6 }}>Vehicle</T>
            <Chips items={myVehicles.map((v) => [v.id, `${v.name} · ₹${Number(v.rate_per_km)}/km`] as [number, string])} value={vehicle ?? 0} onChange={setVehicle} />
            {!myVehicles.length && <T muted>No vehicle added yet — ask accounts to add your vehicle and rate.</T>}
            <Row gap={8} style={{ marginTop: 10 }}>
              <View style={{ flex: 1 }}><Input label="Meter start" keyboardType="number-pad" value={odoS} onChangeText={setOdoS} /></View>
              <View style={{ flex: 1 }}><Input label="Meter end" keyboardType="number-pad" value={odoE} onChangeText={setOdoE} /></View>
            </Row>
            {!(odoS && odoE) && <Input label="…or km travelled" keyboardType="numeric" value={km} onChangeText={setKm} />}
            <Pressable onPress={async () => { try { setGps((await api<any>('/erp/mileage/gps')).km); } catch (e) { setErr((e as Error).message); } }}>
              <Text style={{ color: C.gold, fontWeight: '600', marginBottom: 8 }}>📍 GPS km today: {gps ?? 'tap to get'}</Text>
            </Pressable>
            {veh && kmVal > 0 && <T b style={{ marginBottom: 8 }}>{kmVal} km × ₹{Number(veh.rate_per_km)} = {rs(kmVal * Number(veh.rate_per_km))}</T>}
          </>
        ) : (
          <>
            <T muted style={{ marginBottom: 6 }}>Category</T>
            <Chips items={cats.map((c) => [c, c] as [string, string])} value={cat} onChange={setCat} />
            <Input label="Amount (₹)" keyboardType="numeric" value={amount} onChangeText={setAmount} style={{ marginTop: 10 }} />
            <Input label="Merchant / shop" value={merchant} onChangeText={setMerchant} />
            <Input label="Paid to (person)" value={paidTo} onChangeText={setPaidTo} />
            <Chips items={[['cash', 'Cash'], ['upi', 'UPI'], ['card', 'Card']]} value={mode} onChange={setMode} />
            <Row style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
              <T style={{ flex: 1 }}>Claim reimbursement (I paid)</T>
              <Switch value={reimburse} onValueChange={setReimburse} trackColor={{ true: C.gold }} />
            </Row>
          </>
        )}
        {openTrips.length > 0 && (
          <>
            <T muted style={{ marginBottom: 6 }}>Against trip (optional)</T>
            <Chips items={[[0, 'No trip'], ...openTrips.map((t) => [t.id, `${t.destination}`] as [number, string])]} value={trip ?? 0} onChange={(v: number) => setTrip(v || null)} />
          </>
        )}
        <Input label="Description" value={note} onChangeText={setNote} style={{ marginTop: 10 }} />
        <Row style={{ flexWrap: 'wrap' }}>
          {bills.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />)}
          <Button small variant="ghost" title={kind === 'mileage' ? '📷 Meter photo' : '📷 Bill photo'} onPress={async () => { const p = await takePhoto(); if (p) setBills([...bills, p]); }} />
        </Row>
        <Button title="Send to accounts" loading={busy} style={{ marginTop: 12 }}
          disabled={kind === 'mileage' ? !vehicle || kmVal <= 0 : !cat || !(Number(amount) > 0)} onPress={save} />
      </Card>

      {(trips.data ?? []).length > 0 && <T b style={{ marginTop: 16, marginBottom: 6 }}>My trips</T>}
      {(trips.data ?? []).slice(0, 5).map((t: any) => (
        <Card key={t.id} style={{ marginBottom: 6 }}>
          <Row><T b style={{ flex: 1 }}>{t.destination}</T><St s={t.status} /></Row>
          <T muted size={12}>{d8(t.from_date)} – {d8(t.to_date)} · budget {rs(t.budget_total)} · spent {rs(t.spent)}</T>
        </Card>
      ))}
      <T b style={{ marginTop: 16, marginBottom: 6 }}>My expenses</T>
      {(list.data?.items ?? []).slice(0, 30).map((e: any) => (
        <Card key={e.id} style={{ marginBottom: 6 }}>
          <Row><T style={{ flex: 1 }}>{e.kind === 'mileage' ? `🛵 ${e.km} km` : e.category}{e.merchant ? ` · ${e.merchant}` : ''}</T><T b>{rs(e.amount)}</T></Row>
          <Row><T muted size={12} style={{ flex: 1 }}>{d8(e.exp_date)} · {STATUS[e.status] ?? e.status}{e.verify_note ? ` · ${e.verify_note}` : ''}</T><St s={e.status} /></Row>
        </Card>
      ))}
      <View style={{ height: 30 }} />
    </Screen>
  );
}
