import { dateOf } from '../lib/format';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';
import { Button, Card, Chips, Empty, ErrorText, Input, Loading, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

/** Lessons learnt — search before a job, add one after a mistake or complaint. */
export default function Knowledge() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const { data, loading, reload } = useApi<any>('/kb', { q, category: cat });
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: '', problem: '', lesson: '', category: 'Other' });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setErr(null);
    if (!f.title.trim() || !f.lesson.trim()) return setErr('Write a title and the lesson');
    try { await api('/kb', { body: f }); setAdding(false); setF({ title: '', problem: '', lesson: '', category: 'Other' }); reload(); } catch (e) { setErr((e as Error).message); }
  };
  return (
    <Screen back title="Knowledge base" refreshing={loading} onRefresh={reload}
      right={<Text style={{ color: C.gold, fontWeight: '600' }} onPress={() => setAdding(!adding)}>{adding ? 'Close' : '＋ Lesson'}</Text>}>
      {adding && (
        <Card style={{ marginBottom: 12 }}>
          <ErrorText msg={err} />
          <Input label="Title *" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} placeholder="Seal joints before pouring concrete" />
          <Input label="What went wrong" value={f.problem} onChangeText={(v) => setF({ ...f, problem: v })} multiline />
          <Input label="Lesson — do this next time *" value={f.lesson} onChangeText={(v) => setF({ ...f, lesson: v })} multiline />
          <Chips items={(data?.categories ?? []).map((c: string) => [c, c])} value={f.category} onChange={(v: string) => setF({ ...f, category: v })} />
          <View style={{ height: 10 }} />
          <Button title="Save lesson" onPress={save} />
        </Card>
      )}
      <TextInput value={q} onChangeText={setQ} placeholder="🔍 Search — concrete, leakage, wire…" placeholderTextColor="#B9A994"
        style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10, color: C.text }} />
      <Chips items={[['', 'All'], ...(data?.categories ?? []).map((c: string) => [c, c])] as [string, string][]} value={cat} onChange={setCat} />
      <View style={{ height: 10 }} />
      {!data ? <Loading /> : data.items.length ? data.items.map((k: any) => (
        <Card key={k.id} style={{ marginBottom: 10 }}>
          <T b>{k.title}</T>
          <T muted style={{ fontSize: 12 }}>{k.category}{k.source_label ? ` · from ${k.source_type}` : ''}</T>
          {k.problem ? <T style={{ marginTop: 6 }} muted>Problem: {k.problem}</T> : null}
          <View style={{ backgroundColor: C.greenSoft, borderRadius: 8, padding: 8, marginTop: 6 }}><T>✅ {k.lesson}</T></View>
          <T muted style={{ fontSize: 11, marginTop: 6 }}>{k.created_by_name} · {dateOf(k.created_at)}</T>
        </Card>
      )) : <Empty text="No lessons yet" />}
    </Screen>
  );
}
