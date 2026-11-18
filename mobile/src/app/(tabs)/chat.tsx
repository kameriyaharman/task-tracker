import { useState } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { ago, initials } from '../../lib/format';
import { Picker } from '../../components/Picker';
import { Avatar, Card, Empty, ErrorText, Loading, Row, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';

export default function ChatList() {
  const { t } = useAuth();
  const { data, loading, error, reload } = useApi<any[]>('/chat/rooms');
  const people = useApi<any[]>('/employees');
  const [pick, setPick] = useState(false);

  const openDm = async (userId: number) => {
    const r = await api<{ id: number }>('/chat/rooms', { body: { user_id: userId } });
    router.push(`/chat/${r.id}`);
  };

  return (
    <Screen title={t('chat')} refreshing={loading} onRefresh={reload}
      right={<Text style={{ color: C.gold, fontSize: 26 }} onPress={() => setPick(true)}>＋</Text>}>
      <ErrorText msg={error} />
      {!data ? <Loading /> : data.length ? data.map((r) => (
        <Card key={r.id} onPress={() => router.push(`/chat/${r.id}`)} style={{ marginBottom: 8 }}>
          <Row>
            <Avatar initials={r.is_group ? '👥' : initials(r.title ?? '')} size={42} />
            <View style={{ flex: 1 }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <T b>{r.title}</T>
                {r.last_message_at && <T muted>{ago(r.last_message_at)}</T>}
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <T muted numberOfLines={1} style={{ flex: 1 }}>{r.last_kind === 'voice' ? '🎤 Voice message' : r.last_kind === 'task' ? '📌 Task shared' : r.last_kind === 'file' ? '📎 File' : r.last_body ?? ''}</T>
                {r.unread > 0 && <View style={{ backgroundColor: C.gold, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 1 }}><Text style={{ color: '#fff', fontSize: 11 }}>{r.unread}</Text></View>}
              </Row>
            </View>
          </Row>
        </Card>
      )) : <Empty text={t('nothing_here')} />}
      <Picker visible={pick} title={t('message').replace('…', '')} search onClose={() => setPick(false)} onPick={openDm}
        options={(people.data ?? []).map((p) => ({ value: p.id, label: p.name, sub: p.designation, initials: p.initials }))} />
    </Screen>
  );
}
