import { useEffect, useState } from 'react';
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
  const depts = useApi<any[]>('/departments');
  const templates = useApi<any[]>('/task-templates');
  const defaults = useApi<{ default_due_hours: number }>('/task-defaults');

  const defaultDue = (h = 4) => { const d = new Date(Date.now() + h * 3600e3); d.setSeconds(0, 0); return d; };
  const [title, setTitle] = useState(p.title ?? '');
  const [assignees, setAssignees] = useState<number[]>(p.assigned_to ? [+p.assigned_to] : []);
  const [dept, setDept] = useState<number | null>(null);
  const [dueTouched, setDueTouched] = useState(!!p.due_at);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [due, setDue] = useState<Date>(p.due_at ? new Date(p.due_at.replace(' ', 'T')) : defaultDue());
  const [priority, setPriority] = useState(p.priority ?? 'medium');
  const [whatsapp, setWhatsapp] = useState(true);
  const [remind, setRemind] = useState(true);
  const [checklist, setChecklist] = useState<{ label: string; assigned_to: number | null }[]>([]);
  const [stepFor, setStepFor] = useState<number | null>(null);
  const [files, setFiles] = useState<UploadFile[]>([]);
  const voice = useVoiceNote();

  const [freq, setFreq] = useState<'none' | 'daily' | 'weekly' | 'monthly' | 'custom'>('none');
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5, 6]);
  const [monthDay, setMonthDay] = useState('1');
  const [interval, setInterval_] = useState('2');
  const [rotation, setRotation] = useState<number[]>([]);
  const [next, setNext] = useState<string[]>([]);

  const [picker, setPicker] = useState<null | 'assignee' | 'priority' | 'due' | 'rotation' | 'template' | 'step'>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameOf = (id: number | null) => people.data?.find((x) => x.id === id)?.name ?? '';
  const visible = (people.data ?? []).filter((x) => !dept || x.department_id === dept);
  useEffect(() => { if (!dueTouched && defaults.data) setDue(defaultDue(defaults.data.default_due_hours)); }, [defaults.data]); // eslint-disable-line

  const applyTemplate = (id: number) => {
    const tp = templates.data?.find((x) => x.id === id);
    if (!tp) return;
    setTitle(tp.title); setPriority(tp.priority);
    if (tp.department_id) setDept(tp.department_id);
    if (tp.due_hours) { setDue(defaultDue(tp.due_hours)); setDueTouched(true); }
    setChecklist((tp.checklist ?? []).map((c: any) => (typeof c === 'string' ? { label: c, assigned_to: null } : { label: c.label, assigned_to: c.assigned_to ?? null })));
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (title.trim().length < 2) e.title = 'Write what has to be done';
    if (!assignees.length) e.assignee = 'choose at least one person';
    if (freq === 'none' && due < new Date(Date.now() - 60e3)) e.due = 'time is in the past';
    if (freq === 'monthly' && !(+monthDay >= 1 && +monthDay <= 31)) e.repeat = 'Date must be 1–31';
    if (voice.recording) e.voice = 'Stop the recording first';
    setErrors(e);
    if (Object.keys(e).length) setErr('Please fill the fields marked in red');
    return !Object.keys(e).length;
  };

  const preview = async (f = freq, w = weekdays, md = monthDay, iv = interval) => {
    if (f === 'none') return setNext([]);
    const r = await api<{ next: string[] }>('/recurring/preview', { body: { frequency: f, weekdays: w, month_day: +md, interval_days: +iv } }).catch(() => ({ next: [] }));
    setNext(r.next);
  };

  const save = async () => {
    setErr(null);
    if (!validate()) return;
    setBusy(true);
    try {
      const repeat = freq === 'none' ? undefined : {
        frequency: freq, weekdays, month_day: +monthDay, interval_days: +interval,
        due_time: `${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}:00`,
        rotation: rotation.length > 1 ? rotation : [],
      };
      const r = await api<any>('/tasks', {
        body: form(
          { title: title.trim(), assignees: JSON.stringify(assignees), due_at: sqlDateTime(due), priority, send_whatsapp: whatsapp, remind_before_min: remind ? 60 : undefined,
            checklist: JSON.stringify(checklist.filter((c) => c.label.trim())), repeat, source: p.source ?? 'manual', voice_duration: voice.file ? voice.seconds : undefined },
          { attachments: files, voice_note: voice.file },
        ),
      });
      router.replace(`/task/${r.id}`);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen back title={t('new_task')} right={<Text style={{ color: C.gold, fontWeight: '600' }} onPress={() => router.replace('/task/voice')}>🎤 {t('speak_task')}</Text>}>
      <ErrorText msg={err} />
      {!!templates.data?.length && <Select label="Template (optional)" value="Choose a standard task…" onPress={() => setPicker('template')} />}
      <Input label={`${t('task')} *`} value={title} onChangeText={(v) => { setTitle(v); setErrors({ ...errors, title: '' }); }} placeholder="Collect bill from UltraTech dealer" autoFocus={!p.title} error={errors.title} />

      <Row gap={8} style={{ marginBottom: 12 }}>
        <Pressable onPress={() => (voice.recording ? voice.stop() : voice.start())} style={[pill, (voice.recording || voice.file) && pillOn]}>
          <Text style={{ color: voice.recording ? C.red : C.text }}>{voice.recording ? `⏺ ${mmss(voice.seconds)}` : voice.file ? `🎤 ${mmss(voice.seconds)}` : `🎤 ${t('voice_note')}`}</Text>
        </Pressable>
        <Pressable onPress={async () => { const f = await pickFile(); if (f) setFiles([...files, f]); }} style={[pill, files.length > 0 && pillOn]}>
          <Text>📎 {t('file')}{files.length ? ` (${files.length})` : ''}</Text>
        </Pressable>
      </Row>
      {errors.voice ? <Text style={{ color: C.red, marginTop: -6, marginBottom: 8 }}>{errors.voice}</Text> : null}
      {files.length > 0 && <T muted style={{ marginTop: -4, marginBottom: 10 }}>📎 {files.map((f) => f.name).join(', ')}  <Text style={{ color: C.red }} onPress={() => setFiles([])}>✕</Text></T>}

      {checklist.map((c, i) => (
        <Row key={i} gap={6} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}>
            <Input value={c.label} placeholder={`${i + 1}. ${i === 0 ? 'Collect the bill' : 'Next step'}`}
              onChangeText={(v) => setChecklist(checklist.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
          </View>
          <Pressable onPress={() => { setStepFor(i); setPicker('step'); }} style={[pill, { marginTop: 6 }, c.assigned_to ? pillOn : null]}>
            <Text>{c.assigned_to ? `👤 ${nameOf(c.assigned_to).split(' ')[0]}` : '👤 Same'}</Text>
          </Pressable>
          <Text onPress={() => setChecklist(checklist.filter((_, j) => j !== i))} style={{ color: C.muted, padding: 10, marginTop: 4 }}>✕</Text>
        </Row>
      ))}
      <Pressable onPress={() => setChecklist([...checklist, { label: '', assigned_to: null }])} style={[pill, { alignSelf: 'flex-start', marginBottom: 12 }]}>
        <Text>＋ {t('checklist')} item</Text>
      </Pressable>

      <T muted style={{ marginBottom: 6 }}>Department</T>
      <Chips items={[[0, 'All'], ...((depts.data ?? []).map((d) => [d.id, d.name]) as [number, string][])]} value={dept ?? 0} onChange={(v: number) => setDept(v || null)} />
      <View style={{ height: 10 }} />

      <Select label={`${t('assign_to')} *`} error={errors.assignee} value={assignees.length ? assignees.map((id) => nameOf(id)).join(', ') : 'Tap to choose (one or more)'} onPress={() => { setErrors({ ...errors, assignee: '' }); setPicker('assignee'); }} />
      <Row gap={10}>
        <View style={{ flex: 1 }}><Select label={t('due')} error={errors.due} value={dueLabel(sqlDateTime(due), t)} onPress={() => setPicker('due')} /></View>
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
        {freq === 'monthly' && <Input style={{ marginTop: 10 }} label="Every month on date (e.g. 1 = rent on 1st)" error={errors.repeat} keyboardType="number-pad" value={monthDay} onChangeText={(v) => { setMonthDay(v); preview(freq, weekdays, v); }} />}
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

      <Button title={assignees.length > 1 ? `${t('assign_task')} (${assignees.length})` : t('assign_task')} onPress={save} loading={busy} />

      <Picker visible={picker === 'assignee'} multi title={`${t('assign_to')} — tick one or more`} search onClose={() => setPicker(null)}
        onPick={(id) => setAssignees(assignees.includes(id) ? assignees.filter((x) => x !== id) : [...assignees, id])}
        options={visible.map((x) => ({ value: x.id, label: `${assignees.includes(x.id) ? '✓ ' : ''}${x.id === me?.id ? `${x.name} (me)` : x.name}`, sub: [x.designation, x.department_name].filter(Boolean).join(' · '), initials: x.initials }))} />
      <Picker visible={picker === 'step'} title="Who does this step?" search onClose={() => setPicker(null)}
        onPick={(id) => setChecklist(checklist.map((x, j) => (j === stepFor ? { ...x, assigned_to: id || null } : x)))}
        options={[{ value: 0, label: 'Same person as the task' }, ...(people.data ?? []).map((x) => ({ value: x.id, label: x.name, sub: x.department_name ?? '', initials: x.initials }))]} />
      <Picker visible={picker === 'template'} title="Templates" search onClose={() => setPicker(null)} onPick={applyTemplate}
        options={(templates.data ?? []).map((x) => ({ value: x.id, label: `${x.code} — ${x.title}`, sub: [x.department_name, x.checklist?.length ? `${x.checklist.length} steps` : ''].filter(Boolean).join(' · ') }))} />
      <Picker visible={picker === 'rotation'} title={t('rotate_between')} search onClose={() => setPicker(null)}
        onPick={(id) => setRotation(rotation.includes(id) ? rotation.filter((x) => x !== id) : [...rotation, id])}
        options={(people.data ?? []).map((x) => ({ value: x.id, label: `${rotation.includes(x.id) ? '✓ ' : ''}${x.name}`, initials: x.initials }))} />
      <Picker visible={picker === 'priority'} title={t('priority')} onClose={() => setPicker(null)} onPick={setPriority}
        options={[{ value: 'urgent', label: `⚡ ${t('urgent')}` }, { value: 'high', label: `🔴 ${t('high')}` }, { value: 'medium', label: `🟠 ${t('medium')}` }, { value: 'low', label: `🟢 ${t('low')}` }]} />
      <DuePicker visible={picker === 'due'} value={due} onPick={(d) => { setDue(d); setDueTouched(true); setErrors({ ...errors, due: '' }); }} onClose={() => setPicker(null)} />
    </Screen>
  );
}

const pill = { borderWidth: 1, borderColor: C.line, backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 } as const;
const pillOn = { borderColor: C.gold, backgroundColor: C.goldSoft } as const;
