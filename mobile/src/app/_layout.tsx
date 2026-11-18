import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, usePathname, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from '../lib/auth';
import { diag, onFatal } from '../lib/diag';
import { handleNotificationTaps } from '../lib/push';
import '../lib/tracking'; // registers the background location task at startup

/** Shown instead of closing the app when something breaks; the error is also sent to the server. */
function CrashScreen({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#2B1A10', padding: 24, paddingTop: 70 }}>
      <Text style={{ color: '#E8C77A', fontSize: 20, fontWeight: '700' }}>Something went wrong</Text>
      <Text style={{ color: '#E6CFA3', marginTop: 8 }}>The error has been sent to support. Please try again.</Text>
      <ScrollView style={{ marginTop: 16, maxHeight: 320, backgroundColor: '#3D2617', borderRadius: 10, padding: 12 }}>
        <Text style={{ color: '#fff', fontSize: 12 }} selectable>{error.message}{'\n\n'}{error.stack?.slice(0, 1500)}</Text>
      </ScrollView>
      <Pressable onPress={retry} style={{ marginTop: 20, backgroundColor: '#A8722C', borderRadius: 12, padding: 14, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontWeight: '600' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

/** Expo Router calls this for errors thrown while rendering any screen. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => diag('render-error', error), [error]);
  return <CrashScreen error={error} retry={retry} />;
}

export default function RootLayout() {
  const [fatal, setFatal] = useState<Error | null>(null);
  const path = usePathname();

  useEffect(() => {
    diag('layout-mounted');
    onFatal(setFatal);
    try {
      return handleNotificationTaps();
    } catch (e) {
      diag('error', e);
    }
  }, []);
  useEffect(() => diag('route', path), [path]);

  if (fatal) return <CrashScreen error={fatal} retry={() => setFatal(null)} />;

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#F6F0E6' } }}>
          <Stack.Screen name="index" options={{ animation: 'fade' }} />
          <Stack.Screen name="task/voice" options={{ presentation: 'modal' }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
