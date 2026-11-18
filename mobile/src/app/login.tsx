import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { useAuth, type Me } from '../lib/auth';
import { Brand, Button, ErrorText, Input, T } from '../components/ui';
import { C } from '../lib/theme';

export default function Login() {
  const { t, signIn } = useAuth();
  const [code, setCode] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const otpRef = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    SecureStore.getItemAsync('wt_company').then((c) => c && setCode(c));
  }, []);

  const request = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ masked: string }>('/auth/request-otp', { body: { company_code: code, mobile } });
      await SecureStore.setItemAsync('wt_company', code);
      setSent(r.masked);
      setTimeout(() => otpRef.current?.focus(), 300);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const verify = async (value = otp) => {
    setBusy(true); setErr(null);
    try {
      const r = await api<{ token: string; user: Me }>('/auth/verify-otp', { body: { company_code: code, mobile, otp: value } });
      await signIn(r.token, r.user);
      router.replace('/home');
    } catch (e) { setErr((e as Error).message); setOtp(''); } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#FBF7F1' }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: 24, justifyContent: 'center' }}>
        <View style={{ alignItems: 'center', marginBottom: 26 }}><Brand stacked size={0.8} /></View>
        <T b size={24}>{t('welcome_back')}</T>
        <T muted style={{ marginBottom: 20, marginTop: 4 }}>{t('login_mobile')}</T>
        <ErrorText msg={err} />
        <Input label={t('company_code')} value={code} onChangeText={(v) => setCode(v.toUpperCase())} autoCapitalize="characters" placeholder="ACME2026" editable={!sent} />
        <Input label={t('mobile')} value={mobile} onChangeText={setMobile} keyboardType="phone-pad" placeholder="+91 98XXX XXXXX" editable={!sent} maxLength={14} />

        {sent ? (
          <>
            <Text style={{ color: C.muted, marginVertical: 8 }}>{t('enter_otp')} {sent} · <Text style={{ color: C.gold }} onPress={() => { setSent(null); setOtp(''); }}>{t('change')}</Text></Text>
            <Pressable onPress={() => otpRef.current?.focus()} style={{ flexDirection: 'row', gap: 12, marginBottom: 18 }}>
              {[0, 1, 2, 3].map((i) => (
                <View key={i} style={{ flex: 1, height: 58, borderRadius: 12, borderWidth: 1.5, borderColor: otp.length === i ? C.gold : C.line, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: 22, fontWeight: '600', color: C.text }}>{otp[i] ?? ''}</Text>
                </View>
              ))}
            </Pressable>
            <TextInput ref={otpRef} value={otp} keyboardType="number-pad" maxLength={4} textContentType="oneTimeCode" autoComplete="sms-otp"
              style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }}
              onChangeText={(v) => { const d = v.replace(/\D/g, ''); setOtp(d); if (d.length === 4) verify(d); }} />
            <Button title={t('verify_login')} onPress={() => verify()} disabled={otp.length < 4} loading={busy} />
            <Text style={{ textAlign: 'center', color: C.gold, marginTop: 14 }} onPress={request}>Resend OTP</Text>
          </>
        ) : (
          <Button title={t('send_otp')} onPress={request} disabled={!code || mobile.replace(/\D/g, '').length < 10} loading={busy} style={{ marginTop: 8 }} />
        )}
        <Text style={{ textAlign: 'center', color: C.muted, marginTop: 24 }} onPress={() => router.push('/language')}>🌐 {t('language')}</Text>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
