import { useEffect } from 'react';
import { Text, View } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import { StatusBar } from 'expo-status-bar';
import { useAuth } from '../lib/auth';
import { Brand } from '../components/ui';
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
          const r = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock Keshav' });
          if (!r.success) return;
        }
        router.replace('/home');
      }
    }, 700);
    return () => clearTimeout(id);
  }, [ready, me]);

  return (
    <View style={{ flex: 1, backgroundColor: C.walnut, alignItems: 'center', justifyContent: 'center' }}>
      <StatusBar style="light" />
      <Brand stacked light size={1.15} />
      <Text style={{ color: '#E6CFA3', opacity: 0.7, fontSize: 11, letterSpacing: 2, position: 'absolute', bottom: 48 }}>TEAM · TASKS · ATTENDANCE</Text>
    </View>
  );
}
