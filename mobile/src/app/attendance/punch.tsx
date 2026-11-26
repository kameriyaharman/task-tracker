import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, form, type UploadFile } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { timeOf, sqlDateTime } from '../../lib/format';
import { currentPosition, startTracking, stopTracking } from '../../lib/tracking';
import { takePhoto } from '../../components/media';
import { Button, Card, Chips, ErrorText, Screen, T } from '../../components/ui';
import { C } from '../../lib/theme';

/** Punch in / out with selfie + location (geofence checked on the server). */
export default function Punch() {
  const { t, me } = useAuth();
  const { out } = useLocalSearchParams<{ out?: string }>();
  const [mode, setMode] = useState<'office' | 'field' | 'wfh'>('office');
  const [selfie, setSelfie] = useState<UploadFile | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [fence, setFence] = useState<string | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tries, setTries] = useState(0);
  useEffect(() => {
    (async () => {
      setLocErr(null); setPos(null);
      try {
        const p = await currentPosition();
        setPos(p);
        const fences = await api<any[]>('/geofences');
        const near = fences.find((g) => dist(p.lat, p.lng, +g.lat, +g.lng) <= +g.radius_m);
        setFence(near?.name ?? null);
        if (!near && !out) setMode('field');
      } catch (e) { setLocErr((e as Error).message); }
    })();
  }, [out, tries]);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      if (out) {
        await api('/attendance/punch-out', { body: form({ lat: pos?.lat, lng: pos?.lng }, { selfie }) });
        await stopTracking();
      } else {
        await api('/attendance/punch-in', { body: form({ mode, lat: pos?.lat, lng: pos?.lng }, { selfie }) });
        if (me?.location_consent && mode === 'field') startTracking().catch(() => {});
      }
      router.back();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Screen back title={out ? t('punch_out') : t('punch_in')}>
      {!out && <Chips items={[['office', t('office')], ['field', t('field')], ['wfh', t('wfh')]]} value={mode} onChange={setMode} />}
      <Pressable onPress={async () => setSelfie(await takePhoto(true))}
        style={{ marginTop: 18, alignSelf: 'center', width: 220, height: 220, borderRadius: 110, overflow: 'hidden', backgroundColor: C.goldSoft, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: selfie ? C.green : C.gold }}>
        {selfie ? <Image source={{ uri: selfie.uri }} style={{ width: '100%', height: '100%' }} /> : (
          <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 46 }}>🤳</Text><T style={{ marginTop: 6 }} color={C.gold}>{t('take_selfie')}</T></View>
        )}
      </Pressable>

      <Card style={{ marginTop: 20, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text>📍</Text>
        <T style={{ flex: 1 }} color={locErr ? C.red : fence ? C.green : C.text}>
          {locErr ?? (!pos ? 'Getting location…' : fence ? `${fence} · ${t('inside_geofence')} ✓ · ${timeOf(sqlDateTime(new Date()))}` : `Outside office geofence · ${timeOf(sqlDateTime(new Date()))}`)}
        </T>
        {locErr && <Pressable onPress={() => setTries((n) => n + 1)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: C.gold }}><Text style={{ color: '#fff', fontWeight: '700' }}>Retry</Text></Pressable>}
      </Card>
      {!out && mode === 'office' && pos && !fence && <T muted style={{ marginTop: 8 }}>You're not at an office location — choose “{t('field')}” if you're on a visit.</T>}
      {!out && mode === 'field' && me?.location_consent && <T muted style={{ marginTop: 8 }}>Your location will be shared with your manager until you punch out.</T>}
      <ErrorText msg={err} />
      <Button title={out ? t('punch_out') : t('punch_in')} style={{ marginTop: 20 }} onPress={submit} loading={busy}
        disabled={(!selfie && !out) || (!pos && mode !== 'wfh')} />
    </Screen>
  );
}

function dist(a: number, b: number, c: number, d: number) {
  const r = 6371000, toR = Math.PI / 180;
  const x = Math.sin(((c - a) * toR) / 2) ** 2 + Math.cos(a * toR) * Math.cos(c * toR) * Math.sin(((d - b) * toR) / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(x));
}
