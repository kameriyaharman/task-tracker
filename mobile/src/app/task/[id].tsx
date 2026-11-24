import { useState } from 'react';
import { Alert, Linking, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, fileUrl } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useApi } from '../../lib/hooks';
import { dueLabel, first, overdueLabel, sqlDateTime } from '../../lib/format';
import { Avatar, Badge, Button, Card, ErrorText, Input, Loading, Row, Screen, Section, T } from '../../components/ui';
import { C } from '../../lib/theme';

export default function TaskDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, me } = useAuth();
  const { data: task, error, setData, reload } = useApi<any>(`/tasks/${id}`);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const act = async (path: string, body: Record<string, any> = {}, method = 'POST') => {
    setErr(null);
    try { setData(await api(path, { method, body })); } catch (e) { setErr((e as Error).message); }
  };

  if (!task) return <Screen back title={t('task')}><ErrorText msg={error} />{!error && <Loading />}</Screen>;
  const st = task.display_status;
  const isMine = task.assigned_to === me?.id;
  const done = task.status === 'done' || task.status === 'cancelled' || task.approval_status !== 'none';
  const checked = task.checklist.filter((c: any) => +c.is_done).length;
  const openSteps = task.checklist.length - checked;
  const shareWa = () => {
    const num = String(task.assignee_mobile ?? '').replace(/\D/g, '');
    const steps = task.checklist.length ? '\n' + task.checklist.map((c: any, i: number) => `${i + 1}. ${c.label}${c.assignee_name ? ` (${first(c.assignee_name)})` : ''}`).join('\n') : '';
    const text = `📋 *${task.title}*${task.description ? `\n${task.description}` : ''}\nDue: ${dueLabel(task.due_at, t)}${steps}${task.proof_type ? `\nProof: ${task.proof_type}` : ''}`;
    Linking.openURL(`https://wa.me/${num.length === 10 ? '91' + num : num}?text=${encodeURIComponent(text)}`);
  };

  const askExtension = () =>
    Alert.alert('Ask for more time', 'Extend deadline by', [
      ...[['1 day', 1], ['2 days', 2]].map(([l, d]) => ({
        text: l as string,
        onPress: async () => {
          const base = new Date((task.due_at ?? '').replace(' ', 'T'));
          base.setDate(base.getDate() + (d as number));
          await api('/requests', { body: { type: 'extension', task_id: task.id, extend_to: sqlDateTime(base) } });
          Alert.alert('Request sent', 'Your manager will approve it.');
        },
      })),
      { text: t('cancel'), style: 'cancel' },
    ]);

  return (
    <Screen back title={t('task')} onRefresh={reload}>
      <ErrorText msg={err} />
      <Row gap={6}>
        <Text style={{ color: task.priority === 'high' || task.priority === 'urgent' ? C.red : task.priority === 'medium' ? C.amber : C.green, fontWeight: '600' }}>{task.priority === 'urgent' ? '⚡ ' : ''}{t(task.priority)}</Text>
        <Text style={{ color: C.muted }}>·</Text>
        <Badge s={st} label={st === 'overdue' ? `${t('overdue')} ${overdueLabel(task.overdue_minutes)}` : t(st)} />
      </Row>
      {+task.is_emergency || (+task.escalation_level > 0 && !done) ? (
        <Row gap={6} style={{ marginTop: 6 }}>
          {+task.is_emergency ? <Badge s="overdue" label="🚨 Emergency" /> : null}
          {+task.escalation_level > 0 && !done ? <Badge s="overdue" label={`Escalated · level ${task.escalation_level}`} /> : null}
        </Row>
      ) : null}
      {task.approval_status === 'pending' && (
        <Card style={{ marginTop: 10, borderColor: C.amber, backgroundColor: '#FFFAF0' }}>
          <T b>Waiting for approval</T>
          <T muted>Requested by {first(task.assigner_name)} · approver {first(task.approver_name ?? '')}</T>
          {task.can_approve && (
            <>
              <Input style={{ marginTop: 8 }} value={note} onChangeText={setNote} placeholder="Note (needed to reject)" />
              <Row gap={10}>
                <Button small variant="danger" title={t('reject')} style={{ flex: 1 }} onPress={() => act(`/tasks/${task.id}/reject`, { note })} />
                <Button small title={t('approve')} style={{ flex: 1 }} onPress={() => act(`/tasks/${task.id}/approve`, { note })} />
              </Row>
            </>
          )}
        </Card>
      )}
      {task.approval_status === 'rejected' && <Card style={{ marginTop: 10, borderColor: C.red }}><T b color={C.red}>Request rejected</T><T muted>{task.approval_note}</T></Card>}
      <T b size={22} style={{ marginTop: 8 }}>{task.title}</T>
      <Row style={{ marginTop: 8 }} gap={8}>
        <Avatar initials={task.assignee_initials} size={24} />
        <T muted>{first(task.assignee_name)} · by {first(task.assigner_name)} · {dueLabel(task.due_at, t)}</T>
      </Row>
      {task.description ? <T style={{ marginTop: 12 }}>{task.description}</T> : null}
      <Text onPress={shareWa} style={{ color: '#128C7E', fontWeight: '600', marginTop: 10 }}>🟢 Share on WhatsApp</Text>

      {task.checklist.length > 0 && (
        <Section title={`${t('checklist')} (${checked}/${task.checklist.length})`}>
          <Card style={{ paddingVertical: 4 }}>
            {task.checklist.map((c: any, i: number) => (
              <Pressable key={c.id} disabled={!c.can_tick} onPress={() => act(`/tasks/${task.id}/checklist/${c.id}`, { is_done: !+c.is_done }, 'PATCH')}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, opacity: c.locked ? 0.5 : 1 }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: +c.is_done ? C.gold : '#D8C9B3', backgroundColor: +c.is_done ? C.gold : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  {+c.is_done ? <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>✓</Text> : c.locked ? <Text style={{ fontSize: 10 }}>🔒</Text> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <T style={{ textDecorationLine: +c.is_done ? 'line-through' : 'none', color: +c.is_done ? C.muted : C.text }}>{i + 1}. {c.label}</T>
                  <Text style={{ fontSize: 11.5, color: C.muted }}>
                    {+c.is_done ? `✓ ${first(c.done_by_name ?? '')}` : `👤 ${first(c.assignee_name ?? task.assignee_name)}${c.locked ? ' · after previous step' : ''}`}
                  </Text>
                </View>
              </Pressable>
            ))}
          </Card>
        </Section>
      )}

      {task.attachments.length > 0 && (
        <Section title={t('attachments')}>
          <Row gap={8} style={{ flexWrap: 'wrap' }}>
            {task.attachments.map((a: any) => (
              <Pressable key={a.id} onPress={() => Linking.openURL(a.kind === 'link' ? a.file_name : fileUrl(a.id))}
                style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: C.line, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text>{a.kind === 'voice' ? `🎤 ${a.duration_sec ? `0:${String(a.duration_sec).padStart(2, '0')}` : ''} voice` : a.kind === 'image' ? '🖼 photo' : a.kind === 'link' ? '🔗 link' : `📄 ${a.file_name}`}</Text>
              </Pressable>
            ))}
          </Row>
        </Section>
      )}

      {done && (
        <Card style={{ marginTop: 16, backgroundColor: C.greenSoft, borderColor: C.greenSoft }}>
          <T b color={C.green}>✓ {t('done')}{task.completion_place ? ` · 📍 ${task.completion_place}` : ''}</T>
          {task.completion_remarks ? <T style={{ marginTop: 4 }}>{task.completion_remarks}</T> : null}
        </Card>
      )}

      <Section title={`💬 ${t('comments')}`}>
        {task.comments.map((c: any) => {
          const mine = c.user_id === me?.id;
          return (
            <View key={c.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '85%', marginBottom: 6, padding: 10, borderRadius: 14,
              backgroundColor: mine ? C.goldSoft : '#fff', borderWidth: 1, borderColor: mine ? '#ECD9B4' : C.line }}>
              <Text style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>{mine ? 'You' : first(c.user_name)}</Text>
              <T>{c.body}</T>
            </View>
          );
        })}
        <Row gap={8}>
          <Input style={{ flex: 1, marginBottom: 0 }} value={comment} onChangeText={setComment} placeholder={t('message')} />
          <Button small title="➤" disabled={!comment.trim()} onPress={() => act(`/tasks/${task.id}/comments`, { body: comment }).then(() => setComment(''))} />
        </Row>
      </Section>

      {!done && (isMine || task.can_manage) && (
        <View style={{ marginTop: 22, gap: 10 }}>
          {task.status === 'not_started' && <Button variant="ghost" title={t('start')} onPress={() => act(`/tasks/${task.id}/status`, { status: 'in_progress' })} />}
          {!task.proof_type && <Button variant="ghost" title={`${t('complete_task')} + 📷`} onPress={() => router.push(`/task/complete/${task.id}`)} />}
          <Button title={task.proof_type ? `${t('mark_complete')} (${task.proof_type.replace(/,/g, ' + ')})` : t('mark_complete')}
            onPress={() => (openSteps && !task.can_manage ? setErr(`Finish the checklist first (${openSteps} left)`) : task.proof_type ? router.push(`/task/complete/${task.id}`) : act(`/tasks/${task.id}/complete`))} />
          {isMine && task.due_at && <Text style={{ textAlign: 'center', color: C.gold, marginTop: 4 }} onPress={askExtension}>Need more time?</Text>}
        </View>
      )}
      {done && task.can_manage && <Button variant="ghost" title="Reopen" style={{ marginTop: 20 }} onPress={() => act(`/tasks/${task.id}/reopen`)} />}
    </Screen>
  );
}
