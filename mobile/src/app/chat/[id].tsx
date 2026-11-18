import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAudioPlayer } from 'expo-audio';
import { api, fileUrl, form } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dueLabel, first, timeOf } from '../../lib/format';
import { mmss, useVoiceNote } from '../../components/media';
import { Screen } from '../../components/ui';
import { C } from '../../lib/theme';

function VoiceBubble({ id, seconds, mine }: { id: number; seconds?: number; mine: boolean }) {
  const player = useAudioPlayer(fileUrl(id));
  return (
    <Pressable onPress={() => { player.seekTo(0); player.play(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 18, color: mine ? '#fff' : C.indigo }}>▶</Text>
      <View style={{ width: 90, height: 3, backgroundColor: mine ? '#ffffff88' : '#CFCDE9', borderRadius: 2 }} />
      <Text style={{ color: mine ? '#fff' : C.muted, fontSize: 12 }}>{mmss(seconds ?? 0)}</Text>
    </Pressable>
  );
}

export default function ChatRoom() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useAuth();
  const [room, setRoom] = useState<any>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState('');
  const voice = useVoiceNote();
  const last = useRef(0);
  const list = useRef<FlatList>(null);

  const load = useCallback(async () => {
    const r = await api<any>(`/chat/rooms/${id}/messages`, { query: { after: last.current || undefined } });
    setRoom(r.room);
    if (r.messages.length) {
      last.current = r.messages[r.messages.length - 1].id;
      setMsgs((m) => [...m, ...r.messages.filter((x: any) => !m.some((y) => y.id === x.id))]);
    }
  }, [id]);

  useEffect(() => {
    load().catch(() => {});
    const iv = setInterval(() => load().catch(() => {}), 5000); // light polling — works on shared hosting
    return () => clearInterval(iv);
  }, [load]);

  const send = async () => {
    if (!text.trim()) return;
    const body = text;
    setText('');
    await api(`/chat/rooms/${id}/messages`, { body: { body } });
    load();
  };

  const toggleVoice = async () => {
    if (!voice.recording) return voice.start();
    const f = await voice.stop();
    if (f) {
      await api(`/chat/rooms/${id}/messages`, { body: form({ duration: voice.seconds }, { voice: f }) });
      load();
    }
  };

  return (
    <Screen back title={room?.name ?? t('chat')} scroll={false} pad={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={60}>
        <FlatList
          ref={list}
          data={msgs}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 14, gap: 8 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          renderItem={({ item: m }) => (
            <View style={{ alignSelf: m.mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
              {!m.mine && room?.is_group ? <Text style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{m.user_name}</Text> : null}
              {m.kind === 'task' ? (
                <Pressable onPress={() => router.push(`/task/${m.task_id}`)} style={{ backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: C.indigo }}>
                  <Text style={{ fontSize: 11, color: C.indigo, fontWeight: '600' }}>📌 Task shared</Text>
                  <Text style={{ fontWeight: '600', color: C.text, marginTop: 2 }}>{m.task_title}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>{first(m.task_assignee)} · {dueLabel(m.task_due, t)}</Text>
                </Pressable>
              ) : (
                <View style={{ backgroundColor: m.mine ? C.indigo : '#fff', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 9, borderBottomRightRadius: m.mine ? 4 : 16, borderBottomLeftRadius: m.mine ? 16 : 4 }}>
                  {m.kind === 'voice' && m.attachment_id ? <VoiceBubble id={m.attachment_id} seconds={m.duration_sec} mine={m.mine} />
                    : m.kind === 'file' ? <Text style={{ color: m.mine ? '#fff' : C.indigo }} onPress={() => Linking.openURL(fileUrl(m.attachment_id))}>📎 {m.file_name}</Text>
                    : <Text style={{ color: m.mine ? '#fff' : C.text, fontSize: 15 }}>{m.body}</Text>}
                  <Text style={{ fontSize: 10, color: m.mine ? '#E2E0FF' : C.muted, alignSelf: 'flex-end', marginTop: 2 }}>{timeOf(m.created_at)}</Text>
                </View>
              )}
            </View>
          )}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line }}>
          <TextInput value={text} onChangeText={setText} placeholder={voice.recording ? `⏺ ${mmss(voice.seconds)}` : t('message')} editable={!voice.recording}
            style={{ flex: 1, backgroundColor: C.bg, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10, fontSize: 15 }} onSubmitEditing={send} />
          {text.trim() ? (
            <Pressable onPress={send} style={btn}><Text style={{ color: '#fff', fontSize: 18 }}>➤</Text></Pressable>
          ) : (
            <Pressable onPress={toggleVoice} style={[btn, voice.recording && { backgroundColor: C.red }]}><Text style={{ fontSize: 18 }}>{voice.recording ? '■' : '🎤'}</Text></Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const btn = { width: 44, height: 44, borderRadius: 22, backgroundColor: C.indigo, alignItems: 'center', justifyContent: 'center' } as const;
