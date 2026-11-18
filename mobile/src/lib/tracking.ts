import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { api } from './api';
import { diag } from './diag';

/**
 * Background location for field staff — runs only between punch-in and punch-out,
 * and only when the employee has turned on "Share location during work hours".
 * The server also refuses pings outside working hours or without consent.
 */
export const TRACKING_TASK = 'keshav-location';

try {
TaskManager.defineTask(TRACKING_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const points = locations.map((l) => ({
    lat: l.coords.latitude,
    lng: l.coords.longitude,
    accuracy: Math.round(l.coords.accuracy ?? 0),
    activity: (l.coords.speed ?? 0) > 1.5 ? 'moving' : 'still',
    recorded_at: new Date(l.timestamp).toISOString(),
  }));
  try {
    const r = await api<{ tracking: boolean }>('/location/ping', { body: { points } });
    if (!r.tracking) await stopTracking();
  } catch {
    /* will retry with next batch */
  }
});
} catch (e) {
  diag('error', e); // background tracking unavailable on this device; the rest of the app keeps working
}

export async function startTracking() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return false;
  const bg = await Location.requestBackgroundPermissionsAsync().catch(() => ({ status: 'denied' }));
  if (bg.status !== 'granted') return false;
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false)) return true;
  await Location.startLocationUpdatesAsync(TRACKING_TASK, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 5 * 60 * 1000,
    distanceInterval: 150,
    deferredUpdatesInterval: 5 * 60 * 1000,
    pausesUpdatesAutomatically: true,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Keshav',
      notificationBody: 'Sharing location with your manager until you punch out',
      notificationColor: '#A8722C',
    },
  });
  return true;
}

export async function stopTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(TRACKING_TASK).catch(() => false)) {
    await Location.stopLocationUpdatesAsync(TRACKING_TASK);
  }
}

export async function currentPosition() {
  const p = await Location.requestForegroundPermissionsAsync();
  if (p.status !== 'granted') throw new Error('Location permission is needed');
  const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
  return { lat: pos.coords.latitude, lng: pos.coords.longitude };
}
