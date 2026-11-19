/**
 * Diagnostic build: same native modules + config as the real app, but each native module is
 * loaded/called only when its button is tapped. The step is reported to the server BEFORE it runs,
 * so if the app closes we know exactly which module caused it.
 */
import { useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

const API = (process.env.EXPO_PUBLIC_API_URL || 'https://keshav-web-production.up.railway.app/api').replace(/\/$/, '');
const sid = 'diag-' + Math.random().toString(36).slice(2, 6);

async function report(event: string, detail?: string) {
  try {
    await fetch(`${API}/client-log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sid, event, os: Platform.OS, osv: String(Platform.Version), detail }),
    });
  } catch {
    /* ignore */
  }
}

type Test = { name: string; run: () => Promise<string | void> | string | void };

const tests: Test[] = [
  { name: 'secure-store', run: async () => { const S = require('expo-secure-store'); await S.setItemAsync('diag', '1'); return 'read=' + (await S.getItemAsync('diag')); } },
  { name: 'localization', run: () => JSON.stringify(require('expo-localization').getLocales()[0]?.languageCode) },
  { name: 'constants', run: () => String(require('expo-constants').default.expoConfig?.name) },
  { name: 'device', run: () => String(require('expo-device').modelName) },
  { name: 'notifications-import', run: () => { require('expo-notifications'); return 'imported'; } },
  { name: 'notifications-handler', run: () => { require('expo-notifications').setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }) }); return 'set'; } },
  { name: 'notifications-permission', run: async () => (await require('expo-notifications').getPermissionsAsync()).status },
  { name: 'task-manager-define', run: () => { require('expo-task-manager').defineTask('diag-task', async () => {}); return 'defined'; } },
  { name: 'location-permission', run: async () => (await require('expo-location').getForegroundPermissionsAsync()).status },
  { name: 'local-auth', run: async () => String(await require('expo-local-authentication').hasHardwareAsync()) },
  { name: 'audio-import', run: () => { require('expo-audio'); return 'imported'; } },
  { name: 'image-picker-import', run: () => { require('expo-image-picker'); return 'imported'; } },
  { name: 'document-picker-import', run: () => { require('expo-document-picker'); return 'imported'; } },
  { name: 'linking', run: () => String(require('expo-linking').createURL('/')) },
  { name: 'safe-area-import', run: () => { require('react-native-safe-area-context'); return 'imported'; } },
  { name: 'screens-import', run: () => { require('react-native-screens'); return 'imported'; } },
  { name: 'maps-import', run: () => { require('react-native-maps'); return 'imported'; } },
  { name: 'router-import', run: () => { require('expo-router'); return 'imported'; } },
];

export default function DiagApp() {
  const [results, setResults] = useState<Record<string, string>>({});
  const [showMap, setShowMap] = useState(false);

  const run = async (t: Test) => {
    setResults((r) => ({ ...r, [t.name]: '…' }));
    await report('try:' + t.name);
    try {
      const out = await t.run();
      setResults((r) => ({ ...r, [t.name]: '✓ ' + (out ?? '') }));
      await report('ok:' + t.name, String(out ?? ''));
    } catch (e: any) {
      setResults((r) => ({ ...r, [t.name]: '✗ ' + e?.message }));
      await report('err:' + t.name, `${e?.message}\n${e?.stack ?? ''}`);
    }
  };
  const runAll = async () => { for (const t of tests) await run(t); await report('all-done'); };

  const MapView = showMap ? require('react-native-maps').default : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#F6F0E6', paddingTop: 50 }}>
      <Text style={{ fontSize: 20, fontWeight: '700', textAlign: 'center', color: '#6B3A1C' }}>Keshav — jaanch app</Text>
      <Text style={{ textAlign: 'center', color: '#8A7663', marginBottom: 10 }}>Pehle "Sab chalao" dabayein. App band ho jaye to bas bata dein.</Text>
      <Pressable onPress={runAll} style={{ backgroundColor: '#A8722C', margin: 12, padding: 14, borderRadius: 12 }}>
        <Text style={{ color: '#fff', textAlign: 'center', fontWeight: '700' }}>▶ Sab chalao</Text>
      </Pressable>
      <ScrollView contentContainerStyle={{ padding: 12, gap: 8 }}>
        {tests.map((t) => (
          <Pressable key={t.name} onPress={() => run(t)} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text>{t.name}</Text>
            <Text style={{ color: results[t.name]?.startsWith('✗') ? '#DC2626' : '#16A34A', maxWidth: '55%' }} numberOfLines={1}>{results[t.name] ?? ''}</Text>
          </Pressable>
        ))}
        <Pressable onPress={async () => { await report('try:map-render'); setShowMap(true); }} style={{ backgroundColor: '#fff', padding: 12, borderRadius: 10 }}>
          <Text>map-render (naksha kholo)</Text>
        </Pressable>
      </ScrollView>
      <Modal visible={showMap} onRequestClose={() => setShowMap(false)}>
        {MapView && <MapView style={{ flex: 1 }} initialRegion={{ latitude: 28.59, longitude: 77.05, latitudeDelta: 0.1, longitudeDelta: 0.1 }} />}
        <Pressable onPress={() => setShowMap(false)} style={{ padding: 16, backgroundColor: '#A8722C' }}><Text style={{ color: '#fff', textAlign: 'center' }}>Band karo</Text></Pressable>
      </Modal>
    </View>
  );
}

report('diag-boot');
