import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/ui';
import { C } from '../lib/theme';

/** Splash — routes to language picker (first run), login, or home. */
export default function Splash() {
  const { ready, me } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(async () => {
      const chosen = await SecureStore.getItemAsync('wt_lang');
      if (!me) router.replace(chosen ? '/login' : '/language?next=login');
      else {
        // Optional biometric / device-PIN unlock (turned on from Me → Privacy & security)
        if ((await SecureStore.getItemAsync('wt_bio')) === '1') {
          const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock WorkTrack' });
          if (!r.success) return;
        }
        router.replace('/home');
      }
    }, 700);
    return () => clearTimeout(id);
  }, [ready, me]);

  return (
    <View style={{ flex: 1, backgroundColor: C.navy, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style="light" />
      <Logo size={96} />
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700', marginTop: 18 }}>WorkTrack</Text>
      <Text style={{ color: '#C9C7F5', fontSize: 10, letterSpacing: 3, marginTop: 6 }}>TASKS · ATTENDANCE · TEAM</Text>
    </View>
  );
}
