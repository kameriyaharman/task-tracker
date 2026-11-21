import { useEffect, useState } from 'react';
import { Alert, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { api } from '../../lib/api';
import { useAuth, type Me as MeT } from '../../lib/auth';
import { LANGUAGES } from '../../lib/i18n';
import { stopTracking } from '../../lib/tracking';
import { Avatar, Card, Row, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';

export default function Me() {
  const { me, t, lang, signOut, setMe, isManager } = useAuth();
  const [bio, setBio] = useState(false);
  useEffect(() => { SecureStore.getItemAsync('wt_bio').then((v) => setBio(v === '1')); }, []);
  if (!me) return null;

  const patch = async (body: Record<string, any>) => setMe(await api<MeT>('/me', { method: 'PATCH', body }));

  const toggleBio = async (v: boolean) => {
    if (v) {
      const ok = await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync();
      if (!ok) return Alert.alert('Biometric login is not set up on this phone');
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Enable biometric unlock' });
      if (!r.success) return;
    }
    await SecureStore.setItemAsync('wt_bio', v ? '1' : '0');
    setBio(v);
  };

  const Item = ({ label, value, onPress, right }: { label: string; value?: string; onPress?: () => void; right?: React.ReactNode }) => (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1E8DB' }}>
      <T style={{ flex: 1 }}>{label}</T>
      {value && <T muted style={{ marginRight: 6 }}>{value}</T>}
      {right ?? (onPress ? <Text style={{ color: C.muted, fontSize: 18 }}>›</Text> : null)}
    </Pressable>
  );

  return (
    <Screen title={t('me')}>
      <Card style={{ alignItems: 'center', paddingVertical: 22 }}>
        <Avatar initials={me.initials} size={64} />
        <T b size={18} style={{ marginTop: 10 }}>{me.name}</T>
        <T muted>{me.designation ?? me.role} · {me.company_name}</T>
      </Card>

      <Card style={{ marginTop: 14, paddingVertical: 0 }}>
        <Item label={t('language')} value={LANGUAGES.find((l) => l.code === lang)?.native} onPress={() => router.push('/language')} />
        <Item label={t('notifications')} right={
          <Row gap={14}>
            <Row gap={4}><T muted>App</T><Switch value={me.notify_app} onValueChange={(v) => patch({ notify_app: v })} trackColor={{ true: C.gold }} /></Row>
            <Row gap={4}><T muted>WhatsApp</T><Switch value={me.notify_whatsapp} onValueChange={(v) => patch({ notify_whatsapp: v })} trackColor={{ true: C.green }} /></Row>
          </Row>
        } />
        <Item label={t('share_location')} right={<Switch value={me.location_consent} onValueChange={(v) => { patch({ location_consent: v }); if (!v) stopTracking(); }} trackColor={{ true: C.gold }} />} />
        <Item label={t('google_calendar')} value={me.gcal_enabled ? t('connected') : '—'} onPress={() => router.push('/calendar')} />
        <Item label={`${t('privacy')} · ${t('pin_bio')}`} right={<Switch value={bio} onValueChange={toggleBio} trackColor={{ true: C.gold }} />} />
        <Item label={t('salary_docs')} onPress={() => Alert.alert(t('salary_docs'), 'Your HR team will upload payslips here.')} />
      </Card>

      <Card style={{ marginTop: 14, paddingVertical: 0 }}>
        <Item label="🏬 Showroom work (stock, delivery, udhari, expenses)" onPress={() => router.push('/erp')} />
        <Item label={t('my_attendance')} onPress={() => router.push('/attendance')} />
        <Item label={t('apply_leave')} onPress={() => router.push('/leave')} />
        <Item label={t('timesheet')} onPress={() => router.push('/timesheet')} />
        <Item label={t('performance')} onPress={() => router.push('/performance')} />
        <Item label={t('goals')} onPress={() => router.push('/goals')} />
        {isManager && <Item label={t('approvals')} onPress={() => router.push('/approvals')} />}
        {isManager && <Item label={t('team_location')} onPress={() => router.push('/team-map')} />}
        {isManager && <Item label={t('ai_suggestions')} onPress={() => router.push('/ai')} />}
      </Card>

      <Pressable onPress={async () => { await stopTracking(); await signOut(); router.replace('/login'); }} style={{ marginTop: 20, alignItems: 'center' }}>
        <Text style={{ color: C.red, fontWeight: '600', fontSize: 15 }}>{t('logout')}</Text>
      </Pressable>
      <View style={{ height: 20 }} />
    </Screen>
  );
}
