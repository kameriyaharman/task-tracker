import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useApi } from '../lib/hooks';
import { Button, Card, Empty, ErrorText, Loading, Row, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

/** AI suggested tasks — recurring work spotted from history that isn't scheduled yet. */
export default function AiSuggestions() {
  const { t } = useAuth();
  const { data, loading, reload } = useApi<any[]>('/ai/suggestions');
  const [err, setErr] = useState<string | null>(null);

  const act = async (id: number, a: 'add' | 'skip') => {
    try { await api(`/ai/suggestions/${id}/${a}`, { body: {} }); reload(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <Screen back title={`✨ ${t('ai_suggestions')}`} refreshing={loading} onRefresh={reload}>
      <Card style={{ backgroundColor: C.goldSoft, borderColor: C.goldSoft, marginBottom: 12 }}>
        <T>✨ Based on last month's work, these tasks are due soon:</T>
      </Card>
      <ErrorText msg={err} />
      {!data ? <Loading /> : data.length ? data.map((s) => (
        <Card key={s.id} style={{ marginBottom: 10 }}>
          <T b>{s.title}</T>
          <T muted style={{ marginVertical: 4 }}>{s.reason}{s.user_first_name ? ` · usually ${s.user_first_name}` : ''}</T>
          <Row gap={10} style={{ marginTop: 6 }}>
            <Button small variant="ghost" title={t('skip')} style={{ flex: 1 }} onPress={() => act(s.id, 'skip')} />
            <Button small title={`${t('add')}${s.user_first_name ? ` · ${s.user_first_name}` : ''}`} style={{ flex: 1 }} onPress={() => act(s.id, 'add')} />
          </Row>
        </Card>
      )) : <Empty text={t('all_caught_up')} />}
    </Screen>
  );
}
