import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { ago } from '../lib/format';
import { Card, Empty, Loading, Row, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

const icon: Record<string, string> = {
  task_assigned: '📌', task_overdue: '⚠️', reminder: '⏰', task_done: '✅', task_comment: '💬', chat: '💬',
  request_approved: '✅', request_rejected: '❌', approval_needed: '📝', announcement: '📣', handover: '🤝',
};

export default function Notifications() {
  const { t } = useAuth();
  const { data, loading, reload } = useApi<any>('/notifications');
  useEffect(() => () => { api('/notifications/read', { body: {} }).catch(() => {}); }, []);

  const open = (n: any) => {
    if (n.entity_type === 'task' && n.entity_id) router.push(`/task/${n.entity_id}`);
    else if (n.entity_type === 'chat' && n.entity_id) router.push(`/chat/${n.entity_id}`);
    else if (n.type === 'approval_needed') router.push('/approvals');
    else if (n.entity_type === 'request') router.push('/leave');
  };

  return (
    <Screen back title={t('notifications')} refreshing={loading} onRefresh={reload}>
      {!data ? <Loading /> : data.items.length ? data.items.map((n: any) => (
        <Pressable key={n.id} onPress={() => open(n)}>
          <Card style={{ marginBottom: 8, backgroundColor: n.read_at ? '#fff' : '#F7F6FF' }}>
            <Row style={{ alignItems: 'flex-start' }}>
              <T size={18}>{icon[n.type] ?? '🔔'}</T>
              <View style={{ flex: 1 }}>
                <T b={!n.read_at}>{n.title}</T>
                {n.body ? <T muted>{n.body}</T> : null}
              </View>
              <T muted color={C.muted}>{ago(n.created_at)}</T>
            </Row>
          </Card>
        </Pressable>
      )) : <Empty text={t('all_caught_up')} />}
    </Screen>
  );
}
