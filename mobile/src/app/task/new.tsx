import { useState } from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, form, type UploadFile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { dateOf, dueLabel, sqlDateTime } from '../../lib/format';
import { DuePicker, Picker } from '../../components/Picker';
import { mmss, pickFile, useVoiceNote } from '../../components/media';
import { Button, Card, Chips, ErrorText, Input, Row, Screen, Section, Select, T } from '../../components/ui';
import { C } from '../../lib/theme';

const DAYS: [number, string][] = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];

/** "Delegate a task" + inline "Recurring task" settings. Voice screen can pre-fill via params. */
export default function NewTask() {
  const { t, me } = useAuth();
  const p = useLocalSearchParams<{ title?: string; assigned_to?: string; due_at?: string; priority?: string; source?: string }>();
  const people = useApi<any[]>('/employees');

  const defaultDue = () => { const d = new Date(); d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; };
  const [title, setTitle] = useState(p.title ?? '');
  const [assignee, setAssignee] = useState<number | null>(p.assigned_to ? +p.assigned_to : me?.id ?? null);
  const [due, setDue] = useState<Date>(p.due_at ? new Date(p.due_at.replace(' ', 'T')) : defaultDue());
  const [priority, setPriority] = useState(p.priority ?? 'medium');
  const [whatsapp, setWhatsapp] = useState(true);
  const [remind, setRemind] = useState(true);
  const [checklist, setChecklist] = useState<string[]>([]);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const voice = useVoiceNote();

  const [freq, setFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>('none');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [monthDay, setMonthDay] = useState('1');
  const [interval, setInterval_] = useState('2');
  const [rotation, setRotation] = useState<number[]>([]);
  const [next, setNext] = useState<string[]>([]);

  const [picker, setPicker] = useState<null | 'assignee' | 'priority' | 'due' | 'rotation'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const person = people.data?.find((x) => x.id === assignee);

  const preview = async (f = freq, w = weekdays, md = monthDay, iv = interval) => {
    if (f === 'none') return setNext([]);
    const r = await api<{ next: string[] }>('/recurring/preview', { body: { frequency: f, weekdays: w, month_day: +md, interval_days: +iv } }).catch(() => ({ next: [] }));
    setNext(r.next);
  };

  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const repeat = freq === 'none' ? undefined : {
        frequency: freq, weekdays, month_day: +monthDay, interval_days: +interval,
        due_time: `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}:00`,
        rotation: rotation.length > 1 ? rotation : [],
      };
      const r = await api<any>('/tasks', {
        body: form(
          { title, assigned_to: assignee, due_at: sqlDateTime(due), priority, send_whatsapp: whatsapp, remind_before_min: remind ? 60 : undefined,
            checklist: checklist.filter(Boolean), repeat, source: p.source ?? 'manual', voice_duration: voice.file ? voice.seconds : undefined },
          { attachments: files, voice_note: voice.file },
        ),
      });
      router.replace(`/task/${r.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen back title={t('new_task')} right={<Text style={{ color: C.gold, fontWeight: '600' }} onPress={() => router.replace('/task/voice')}>🎤 {t('speak_task')}</Text>}>
      <ErrorText msg={err} />
      <Input label={t('task')} value={title} onChangeText={setTitle} placeholder="Prepare quotation for Mehta Builders" autoFocus={!p.title} />

      <Row gap={8} style={{ marginBottom: 12 }}>
        <Pressable onPress={() => (voice.recording ? voice.stop() : voice.start())} style={[pill, (voice.recording || voice.file) && pillOn]}>
          <Text style={{ color: voice.recording ? C.red : C.text }}>{voice.recording ? `⏺ ${mmss(voice.seconds)}` : voice.file ? `🎤 ${mmss(voice.seconds)}` : `🎤 ${t('voice_note')}`}</Text>
        </Pressable>
        <Pressable onPress={async () => { const f = await pickFile(); if (f) setFiles([...files, f]); }} style={[pill, files.length > 0 && pillOn]}>
          <Text>📎 {t('file')}{files.length ? ` (${files.length})` : ''}</Text>
        </Pressable>
        <Pressable onPress={() => setChecklist(checklist.length ? checklist : [''])} style={[pill, checklist.length > 0 && pillOn]}><Text>☑ {t('checklist')}</Text></Pressable>
      </Row>

      {checklist.length > 0 && checklist.map((c, i) => (
        <Input key={i} value={c} placeholder={`${i + 1}.`}
          onChangeText={(v) => { const n = [...checklist]; n[i] = v; setChecklist(i === n.length - 1 && v ? [...n, ''] : n); }} />
      ))}

      <Select label={t('assign_to')} value={person ? `${person.name}${person.department_name ? ` (${person.department_name})` : ''}` : '—'} onPress={() => setPicker('assignee')} />
      <Row gap={10}>
        <View style={{ flex: 1 }}><Select label={t('due')} value={dueLabel(sqlDateTime(due), t)} onPress={() => setPicker('due')} /></View>
        <View style={{ flex: 1 }}><Select label={t('priority')} value={t(priority)} onPress={() => setPicker('priority')} /></View>
      </Row>

      <Card style={{ marginBottom: 10 }}>
        <T muted style={{ marginBottom: 8 }}>{t('repeat')}</T>
        <Chips items={[['none', t('does_not_repeat')], ['daily', t('daily')], ['weekly', t('weekly')], ['monthly', t('monthly')], ['custom', t('custom')]]}
          value={freq} onChange={(v: any) => { setFreq(v); preview(v); }} />
        {(freq === 'daily' || freq === 'weekly') && (
          <View style={{ marginTop: 10 }}>
            <Chips multi items={DAYS} value={weekdays} onChange={(v: number[]) => { const s = [...v].sort(); setWeekdays(s); preview(freq, s); }} />
          </View>
        )}
        {freq === 'monthly' && <Input style={{ marginTop: 10 }} label="Day of month" keyboardType="number-pad" value={monthDay} onChangeText={(v) => { setMonthDay(v); preview(freq, weekdays, v); }} />}
        {freq === 'custom' && <Input style={{ marginTop: 10 }} label="Every N days" keyboardType="number-pad" value={interval} onChangeText={(v) => { setInterval_(v); preview(freq, weekdays, monthDay, v); }} />}
        {freq !== 'none' && (
          <>
            {next.length > 0 && <T muted style={{ marginTop: 8 }}>{t('next')}: {next.map((d) => dateOf(d)).join(' · ')}</T>}
            <Pressable onPress={() => setPicker('rotation')} style={{ marginTop: 10 }}>
              <T muted>{t('rotate_between')}</T>
              <T>{rotation.length ? rotation.map((id) => people.data?.find((x) => x.id === id)?.name.split(' ')[0]).join(', ') + ' (alternate)' : '—  tap to add'}</T>
            </Pressable>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 16, paddingVertical: 6 }}>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}><T>🟢 {t('send_whatsapp')}</T><Switch value={whatsapp} onValueChange={setWhatsapp} trackColor={{ true: C.green }} /></Row>
        <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}><T>⏰ {t('remind_before')}</T><Switch value={remind} onValueChange={setRemind} trackColor={{ true: C.gold }} /></Row>
      </Card>

      <Button title={t('assign_task')} onPress={save} loading={busy} disabled={!title.trim() || !assignee || voice.recording} />

      <Picker visible={picker === 'assignee'} title={t('assign_to')} search onClose={() => setPicker(null)} onPick={setAssignee}
        options={(people.data ?? []).map((x) => ({ value: x.id, label: x.id === me?.id ? `${x.name} (me)` : x.name, sub: [x.designation, x.department_name].filter(Boolean).join(' · '), initials: x.initials }))} />
      <Picker visible={picker === 'rotation'} title={t('rotate_between')} search onClose={() => setPicker(null)}
        onPick={(id) => setRotation(rotation.includes(id) ? rotation.filter((x) => x !== id) : [...rotation, id])}
        options={(people.data ?? []).map((x) => ({ value: x.id, label: `${rotation.includes(x.id) ? '✓ ' : ''}${x.name}`, initials: x.initials }))} />
      <Picker visible={picker === 'priority'} title={t('priority')} onClose={() => setPicker(null)} onPick={setPriority}
        options={[{ value: 'high', label: `🔴 ${t('high')}` }, { value: 'medium', label: `🟠 ${t('medium')}` }, { value: 'low', label: `🟢 ${t('low')}` }]} />
      <DuePicker visible={picker === 'due'} value={due} onPick={setDue} onClose={() => setPicker(null)} />
    </Screen>
  );
}

const pill = { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 } as const;
const pillOn = { borderColor: C.gold, backgroundColor: C.goldSoft } as const;
