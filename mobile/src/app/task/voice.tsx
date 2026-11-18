import { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dueLabel, first } from '../../lib/format';
import { Button, Card, ErrorText, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';

/**
 * "Speak a task": the phone keyboard's mic (Gboard / iOS dictation) turns speech into text in
 * Hindi, English or Hinglish; the server then extracts who / what / when.
 * e.g. "Imran, kal 11 baje tak Sharma Traders se payment collect karna"
 */
export default function Voice() {
  const { t } = useAuth();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parse = async (v: string) => {
    if (v.trim().length < 6) return setDraft(null);
    setBusy(true);
    try { setDraft(await api('/tasks/parse-voice', { body: { text: v } })); setErr(null); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const onChange = (v: string) => {
    setText(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => parse(v), 700);
  };

  const create = () =>
    router.replace({
      pathname: '/task/new',
      params: { title: draft.title, assigned_to: draft.assigned_to ?? '', due_at: draft.due_at ?? '', priority: draft.priority, source: 'voice' },
    });

  return (
    <Screen back title={t('speak_task')}>
      <Pressable onPress={() => input.current?.focus()} style={{ alignItems: 'center', marginVertical: 18 }}>
        <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: C.indigoSoft, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 36 }}>🎤</Text>
          </View>
        </View>
        <T muted style={{ marginTop: 12, textAlign: 'center' }}>{busy ? t('listening') : 'Tap the 🎤 on your keyboard and speak'}</T>
      </Pressable>

      <TextInput ref={input} autoFocus multiline value={text} onChangeText={onChange}
        placeholder="“Imran, kal 11 baje tak Sharma Traders se payment collect karna”" placeholderTextColor="#B3B1BF"
        style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: C.line, padding: 14, minHeight: 100, fontSize: 16, color: C.text, textAlignVertical: 'top' }} />
      <ErrorText msg={err} />

      {draft && (
        <Card style={{ marginTop: 14, backgroundColor: C.indigoSoft, borderColor: C.indigoSoft }}>
          <T muted>✨ {t('auto_filled')}</T>
          <T b size={16} style={{ marginTop: 4 }}>{draft.title}</T>
          <T style={{ marginTop: 4 }}>
            {draft.assignee_name ? `👤 ${first(draft.assignee_name)}` : '👤 —'}  ·  {draft.due_at ? `⏰ ${dueLabel(draft.due_at, t)}` : '⏰ —'}  ·  {t(draft.priority)}
          </T>
        </Card>
      )}
      <Button title={t('create_task')} style={{ marginTop: 18 }} disabled={!draft} onPress={create} />
    </Screen>
  );
}
