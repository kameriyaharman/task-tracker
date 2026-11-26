import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { api, form, type UploadFile } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { takePhoto } from '../components/media';
import { currentPosition } from '../lib/tracking';
import { Bar, Button, Card, Chips, DateField, ErrorText, Input, Row, Screen, Section, T } from '../components/ui';
import { dateOf, sqlDate } from '../lib/format';
import { C } from '../lib/theme';
import { rs } from '../lib/erp';

const KINDS: [string, string][] = [['contractor', 'Contractor'], ['house_owner', 'House owner'], ['builder', 'Builder'], ['company', 'Company'], ['dealer', 'Dealer'], ['architect', 'Architect'], ['plumber_electrician', 'Plumber / electrician'], ['other', 'Other']];
const OUT: [string, string][] = [['interested', 'Interested'], ['quotation', 'Wants quotation'], ['order', 'Gave order'], ['follow_up', 'Call again'], ['not_interested', 'Not interested']];
const Stars = ({ n }: { n: number | null }) => <Text style={{ color: '#F59E0B', fontSize: 18 }}>{n === null ? '—' : '★'.repeat(n) + '☆'.repeat(3 - n)}</Text>;

/** Marketing person's day: target progress, today's plan, add site visit (photo + GPS), evening report, 30-day plan. */
export default function Field() {
  const { me } = useAuth();
  const sum = useApi<any>('/marketing/summary');
  const today = useApi<any>('/marketing/today');
  const plan = useApi<any>('/marketing/plan');
  const visits = useApi<any[]>('/marketing/visits');
  const [tab, setTab] = useState('today');
  const [v, setV] = useState({ party_name: '', person: '', phone: '', address: '', kind: 'contractor', expected_amount: '', outcome: 'interested', notes: '' });
  const [photo, setPhoto] = useState<UploadFile | null>(null);
  const [r, setR] = useState<any>({ km_run: '', orders_count: '', orders_amount: '', billed_amount: '', self_rating: 0, notes: '' });
  const [np, setNp] = useState({ plan_date: '', area: '', who_to_meet: '' });
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const reloadAll = () => { sum.reload(); today.reload(); plan.reload(); visits.reload(); };
  const run = async (fn: () => Promise<any>, msg: string) => { setBusy(true); setErr(null); setOk(null); try { await fn(); setOk(msg); reloadAll(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  const addVisit = () => run(async () => {
    if (!photo) throw new Error('Take a photo at the site');
    const pos = await currentPosition();
    await api('/marketing/visits', { body: form({ ...v, lat: pos.lat, lng: pos.lng }, { photo }) });
    setV({ party_name: '', person: '', phone: '', address: '', kind: 'contractor', expected_amount: '', outcome: 'interested', notes: '' }); setPhoto(null);
  }, 'Visit saved with photo & location');

  const t = today.data; const s = sum.data;
  return (
    <Screen back title="My field work" refreshing={sum.loading} onRefresh={reloadAll}>
      {s && (
        <Card style={{ marginBottom: 10 }}>
          <Row style={{ justifyContent: 'space-between' }}><T b>This month</T><Stars n={s.stars} /></Row>
          <T muted size={12}>Sales {rs(s.achieved.amount)} of {rs(s.target.amount)}{s.pct.amount !== null ? ` · ${s.pct.amount}%` : ''}</T>
          <Bar pct={s.pct.amount ?? 0} />
          <T muted size={12} style={{ marginTop: 6 }}>km {s.achieved.km}{s.target.km ? ` / ${s.target.km}` : ''} · visits {s.achieved.visits}{s.target.visits ? ` / ${s.target.visits}` : ''}</T>
          <T style={{ marginTop: 8 }}>Today: <Text style={{ fontWeight: '700' }}>{rs(s.today.sales)}</Text>{s.today.sales_target ? ` of ${rs(s.today.sales_target)} (${s.today.sales_pct ?? 0}%)` : ''} · {s.today.km} km · {s.today.visits} visits</T>
          {s.target.categories?.map((c: any) => <T key={c.category_id} muted size={12}>{c.name}: {rs(c.achieved)} / {rs(c.amount)} ({c.pct ?? 0}%)</T>)}
        </Card>
      )}
      <Chips items={[['today', 'Today'], ['visit', '+ Visit'], ['report', '🌙 Evening report'], ['plan', '📅 30-day plan']]} value={tab} onChange={setTab} />
      <View style={{ height: 10 }} />
      <ErrorText msg={err} />
      {ok && <T color={C.green} b style={{ marginBottom: 8 }}>✓ {ok}</T>}

      {tab === 'today' && (
        <>
          {t?.plan?.length ? t.plan.map((p: any, i: number) => <Card key={i} style={{ marginBottom: 6 }}><T b>📍 {p.area}</T>{p.who_to_meet ? <T muted>{p.who_to_meet}</T> : null}</Card>) : <T muted>No plan for today.</T>}
          <Section title={`Visits today (${visits.data?.length ?? 0})`}>
            {(visits.data ?? []).map((x) => (
              <Card key={x.id} style={{ marginBottom: 6 }}>
                <T b>{x.party_name}</T>
                <T muted size={12}>{x.kind.replace('_', ' ')} · {x.outcome.replace('_', ' ')}{x.expected_amount ? ` · expected ${rs(x.expected_amount)}` : ''} · {x.visited_at.slice(11, 16)}</T>
              </Card>
            ))}
          </Section>
          {!t?.report && <Button title="🌙 Fill evening report" onPress={() => setTab('report')} style={{ marginTop: 10 }} />}
        </>
      )}

      {tab === 'visit' && (
        <Card>
          <Input label="Party / site name *" value={v.party_name} onChangeText={(x) => setV({ ...v, party_name: x })} />
          <Input label="Person met" value={v.person} onChangeText={(x) => setV({ ...v, person: x })} />
          <Input label="Phone" keyboardType="phone-pad" value={v.phone} onChangeText={(x) => setV({ ...v, phone: x })} />
          <Input label="Address" value={v.address} onChangeText={(x) => setV({ ...v, address: x })} />
          <T muted style={{ marginBottom: 6 }}>Who</T>
          <Chips items={KINDS} value={v.kind} onChange={(x: string) => setV({ ...v, kind: x })} />
          <Input label="Expected business (₹)" keyboardType="numeric" value={v.expected_amount} onChangeText={(x) => setV({ ...v, expected_amount: x })} style={{ marginTop: 10 }} />
          <T muted style={{ marginBottom: 6 }}>Result</T>
          <Chips items={OUT} value={v.outcome} onChange={(x: string) => setV({ ...v, outcome: x })} />
          <Input label="Notes" value={v.notes} onChangeText={(x) => setV({ ...v, notes: x })} style={{ marginTop: 10 }} />
          <Row>
            {photo && <Image source={{ uri: photo.uri }} style={{ width: 64, height: 64, borderRadius: 8 }} />}
            <Button small variant="ghost" title={photo ? '📷 Retake' : '📷 Photo at site *'} onPress={async () => { const p = await takePhoto(); if (p) setPhoto(p); }} />
          </Row>
          <T muted size={12} style={{ marginTop: 6 }}>Your location is saved with the photo.</T>
          <Button title="Save visit" loading={busy} disabled={!v.party_name.trim() || !photo} onPress={addVisit} style={{ marginTop: 10 }} />
        </Card>
      )}

      {tab === 'report' && t && (
        <Card>
          <T b>Report for today</T>
          <T muted size={12} style={{ marginBottom: 8 }}>{t.visits} visits · expected {rs(t.expected)} · GPS {t.gps_km} km · bills found {t.orders.count} ({rs(t.orders.amount)}, billed {rs(t.orders.billed)})</T>
          <Input label="km run today" keyboardType="numeric" value={r.km_run} onChangeText={(x) => setR({ ...r, km_run: x })} placeholder={String(t.gps_km)} />
          <Row gap={8}>
            <View style={{ flex: 1 }}><Input label="Orders finalised (no.)" keyboardType="number-pad" value={r.orders_count} onChangeText={(x) => setR({ ...r, orders_count: x })} placeholder={String(t.orders.count)} /></View>
            <View style={{ flex: 1 }}><Input label="Orders ₹" keyboardType="numeric" value={r.orders_amount} onChangeText={(x) => setR({ ...r, orders_amount: x })} placeholder={String(t.orders.amount)} /></View>
          </Row>
          <Input label="Billed today ₹" keyboardType="numeric" value={r.billed_amount} onChangeText={(x) => setR({ ...r, billed_amount: x })} placeholder={String(t.orders.billed)} />
          <T muted style={{ marginBottom: 4 }}>How was your day? (rate yourself)</T>
          <Row gap={6} style={{ marginBottom: 10 }}>
            {[1, 2, 3, 4, 5].map((n) => <Pressable key={n} onPress={() => setR({ ...r, self_rating: n })}><Text style={{ fontSize: 30, color: n <= r.self_rating ? '#F59E0B' : '#DDD' }}>★</Text></Pressable>)}
          </Row>
          <Input label="Notes" value={r.notes} onChangeText={(x) => setR({ ...r, notes: x })} multiline />
          <Button title={t.report ? 'Update report' : 'Submit report'} loading={busy} disabled={!r.self_rating}
            onPress={() => run(() => api('/marketing/daily', { body: {
              km_run: r.km_run || t.gps_km, orders_count: r.orders_count || t.orders.count, orders_amount: r.orders_amount || t.orders.amount,
              billed_amount: r.billed_amount || t.orders.billed, self_rating: r.self_rating, notes: r.notes } }), 'Report submitted — good night!')} />
          {t.report && <T muted size={12} style={{ marginTop: 6 }}>Already submitted at {t.report.submitted_at.slice(11, 16)} — you can update it.</T>}
        </Card>
      )}

      {tab === 'plan' && plan.data && (
        <>
          <Card style={{ marginBottom: 10 }}>
            <T b>Add to my plan</T>
            <DateField label="Date" value={np.plan_date} onChange={(x) => setNp({ ...np, plan_date: x })} />
            <Input label="Area / place" value={np.area} onChangeText={(x) => setNp({ ...np, area: x })} />
            <Input label="Whom to meet" value={np.who_to_meet} onChangeText={(x) => setNp({ ...np, who_to_meet: x })} />
            <Button small title="Add" disabled={!np.plan_date || !np.area} onPress={() => run(async () => { await api('/marketing/plan', { body: np }); setNp({ plan_date: '', area: '', who_to_meet: '' }); }, 'Added to plan')} />
          </Card>
          {Array.from(new Set<string>(plan.data.plans.map((p: any) => p.plan_date))).map((d) => (
            <Card key={d} style={{ marginBottom: 6 }}>
              <T b>{dateOf(d)}{d === sqlDate(new Date()) ? ' · today' : ''}</T>
              {plan.data.plans.filter((p: any) => p.plan_date === d).map((p: any) => <T key={p.id} muted>📍 {p.area}{p.who_to_meet ? ` — ${p.who_to_meet}` : ''}</T>)}
            </Card>
          ))}
          {!plan.data.plans.length && <T muted>No plan this month yet.</T>}
        </>
      )}
      <View style={{ height: 30 }} />
    </Screen>
  );
}
