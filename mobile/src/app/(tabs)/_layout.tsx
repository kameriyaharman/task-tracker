import { Pressable, Text, View, type ColorValue } from 'react-native';
import { Redirect, router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../lib/auth';
import { C } from '../../lib/theme';

const Icon = ({ glyph, color }: { glyph: string; color: ColorValue }) => <Text style={{ fontSize: 19, color }}>{glyph}</Text>;

export default function TabsLayout() {
  const { me, ready, t } = useAuth();
  // Android 15+ draws apps behind the system navigation bar: keep the tab bar above it
  const insets = useSafeAreaInsets();
  if (ready && !me) return <Redirect href="/login" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.gold,
        tabBarInactiveTintColor: '#A8957F',
        tabBarStyle: { height: 64 + insets.bottom, paddingTop: 6, paddingBottom: 8 + insets.bottom, borderTopColor: C.line },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="home" options={{ title: t('home'), tabBarIcon: ({ color }) => <Icon glyph="⌂" color={color} /> }} />
      <Tabs.Screen name="tasks" options={{ title: t('tasks'), tabBarIcon: ({ color }) => <Icon glyph="☑" color={color} /> }} />
      <Tabs.Screen
        name="add"
        options={{
          title: t('task'),
          tabBarButton: () => (
            <Pressable onPress={() => router.push('/task/new')} style={{ flex: 1, alignItems: 'center' }} accessibilityLabel={t('new_task')}>
              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: C.walnut, alignItems: 'center', justifyContent: 'center', marginTop: -22, borderWidth: 4, borderColor: '#fff' }}>
                <Text style={{ color: '#fff', fontSize: 26, marginTop: -2 }}>+</Text>
              </View>
              <Text style={{ fontSize: 11, color: '#A8957F', marginTop: 1 }}>{t('task')}</Text>
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen name="chat" options={{ title: t('chat'), tabBarIcon: ({ color }) => <Icon glyph="💬" color={color} /> }} />
      <Tabs.Screen name="me" options={{ title: t('me'), tabBarIcon: ({ color }) => <Icon glyph="◉" color={color} /> }} />
    </Tabs>
  );
}
