import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { api } from './api';
import { diag } from './diag';

try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: true }),
  });
} catch (e) {
  diag('error', e);
}

/** Ask permission, get Expo push token and send it to the API (works for Android FCM + iOS APNs via Expo). */
export async function registerPush() {
  if (!Device.isDevice) return;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Keshav', importance: Notifications.AndroidImportance.HIGH });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== 'granted') return;
  const projectId = (Constants.expoConfig?.extra as any)?.eas?.projectId || undefined;
  const { data } = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  await api('/me', { method: 'PATCH', body: { push_token: data } });
  diag('push-registered');
}

/** Open the right screen when a notification is tapped. */
export function handleNotificationTaps() {
  const sub = Notifications.addNotificationResponseReceivedListener((r) => {
    const d = r.notification.request.content.data as any;
    if (d?.entity_type === 'task' && d.entity_id) router.push(`/task/${d.entity_id}`);
    else if (d?.entity_type === 'chat' && d.entity_id) router.push(`/chat/${d.entity_id}`);
    else if (d?.entity_type === 'request') router.push('/approvals');
    else router.push('/notifications');
  });
  return () => sub.remove();
}
