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

/**
 * Current position that works indoors and on phones with location switched off:
 * 1) asks for permission, 2) on Android pops the system "turn on location" dialog,
 * 3) uses a recent last-known fix at once, 4) tries balanced (wifi/cell) then GPS with timeouts,
 * 5) finally listens for a fix for up to 20 s.
 */
export async function currentPosition(): Promise<{ lat: number; lng: number; accuracy?: number }> {
  const p = await Location.requestForegroundPermissionsAsync();
  if (p.status !== 'granted') {
    throw new Error(p.canAskAgain === false
      ? 'Location permission is off. Open phone Settings → Apps → Keshav → Permissions → Location → Allow.'
      : 'Location permission is needed — please tap Allow.');
  }
  let on = await Location.hasServicesEnabledAsync().catch(() => true);
  if (!on) {
    try { await Location.enableNetworkProviderAsync(); } catch { /* user said no */ }
    on = await Location.hasServicesEnabledAsync().catch(() => true);
    if (!on) throw new Error('Phone location (GPS) is OFF. Swipe down from the top and turn on Location, then tap Retry.');
  }
  const out = (l: Location.LocationObject) => ({ lat: l.coords.latitude, lng: l.coords.longitude, accuracy: l.coords.accuracy ?? undefined });
  const recent = await Location.getLastKnownPositionAsync({ maxAge: 2 * 60 * 1000, requiredAccuracy: 300 }).catch(() => null);
  if (recent) return out(recent);
  const withTimeout = <X,>(pr: Promise<X>, ms: number) => Promise.race([pr, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  for (const [acc, ms] of [[Location.Accuracy.Balanced, 8000], [Location.Accuracy.High, 12000]] as const) {
    const l = await withTimeout(Location.getCurrentPositionAsync({ accuracy: acc }).catch(() => null), ms);
    if (l) return out(l);
  }
  const watched = await new Promise<Location.LocationObject | null>((resolve) => {
    let sub: Location.LocationSubscription | null = null;
    const done = (l: Location.LocationObject | null) => { sub?.remove(); clearTimeout(timer); resolve(l); };
    const timer = setTimeout(() => done(null), 20000);
    Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, timeInterval: 1000, distanceInterval: 0 }, (l) => done(l))
      .then((s) => { sub = s; }).catch(() => done(null));
  });
  if (watched) return out(watched);
  const old = await Location.getLastKnownPositionAsync({}).catch(() => null);
  if (old) return out(old);
  throw new Error('Could not get your location. Turn on Location (High accuracy), step near a window or outside, then tap Retry.');
}
