import { useState } from 'react';
import { Image, Linking, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';
import { api, form, type UploadFile } from '../../../lib/api';
import { useApi } from '../../../lib/hooks';
import { takePhoto } from '../../../components/media';
import { Button, Card, Chips, ErrorText, Input, Loading, Row, Screen, T } from '../../../components/ui';
import { St, qty } from '../../../lib/erp';

export default function DeliveryDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: d, loading, reload } = useApi<any>(`/erp/deliveries/${id}`);
  const [mode, setMode] = useState<'delivered' | 'failed'>('delivered');
  const [otp, setOtp] = useState('');
  const [receiver, setReceiver] = useState('');
  const [reason, setReason] = useState('');
  const [photos, setPhotos] = useState<UploadFile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!d) return <Screen back title="Delivery"><Loading /></Screen>;
  const open = ['pending', 'packed', 'dispatched'].includes(d.status);
  const send = async (status: string) => {
    setBusy(true); setErr(null);
    try {
      let lat: number | undefined, lng: number | undefined;
      if (status === 'delivered') {
        try { const p = await Location.getLastKnownPositionAsync(); lat = p?.coords.latitude; lng = p?.coords.longitude; } catch { /* optional */ }
      }
      await api(`/erp/deliveries/${id}/status`, { body: form({ status, otp: otp || undefined, receiver_name: receiver || undefined, failure_reason: reason || undefined, lat, lng }, { photos }) });
      await reload();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  return (
    <Screen back title={d.delivery_no} refreshing={loading} onRefresh={reload}>
      <ErrorText msg={err} />
      <Card>
        <Row><T b size={16} style={{ flex: 1 }}>{d.customer_name}</T><St s={d.status} /></Row>
        <T style={{ marginTop: 4 }}>{d.address ?? 'No address'}</T>
        <Row style={{ marginTop: 10 }}>
          {d.customer_mobile && <Button small variant="ghost" title={`📞 ${d.customer_mobile}`} onPress={() => Linking.openURL(`tel:${d.customer_mobile}`)} />}
          {d.address && <Button small variant="ghost" title="🗺 Map" onPress={() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(d.address)}`)} />}
        </Row>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <T b style={{ marginBottom: 6 }}>Items · bill {d.invoice_no}</T>
        {d.items.map((i: any) => <Row key={i.id} style={{ paddingVertical: 4 }}><T style={{ flex: 1 }}>{i.product_name}</T><T b>{qty(i.qty)} {i.unit}</T></Row>)}
      </Card>
      {open && (
        <>
          <Row style={{ marginTop: 12 }}>
            {d.status === 'pending' && <Button small variant="ghost" title="Packed" style={{ flex: 1 }} onPress={() => send('packed')} disabled={busy} />}
            {['pending', 'packed'].includes(d.status) && <Button small variant="ghost" title="Start delivery" style={{ flex: 1 }} onPress={() => send('dispatched')} disabled={busy} />}
          </Row>
          <Card style={{ marginTop: 12 }}>
            <Chips items={[['delivered', 'Delivered'], ['failed', 'Could not deliver']]} value={mode} onChange={setMode} />
            {mode === 'delivered' ? (
              <>
                <Input label="Customer OTP" keyboardType="number-pad" value={otp} onChangeText={setOtp} maxLength={6} />
                <Input label="Received by" value={receiver} onChangeText={setReceiver} />
              </>
            ) : <Input label="Reason" value={reason} onChangeText={setReason} placeholder="Customer not available, wrong address…" />}
            <Row style={{ marginTop: 6, flexWrap: 'wrap' }}>
              {photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />)}
              <Button small variant="ghost" title="📷 Add photo" onPress={async () => { const p = await takePhoto(); if (p) setPhotos([...photos, p]); }} />
            </Row>
            <T muted size={12} style={{ marginTop: 6 }}>{mode === 'delivered' ? 'Ask the customer for the OTP. No OTP? Take a photo of the delivered material.' : ''}</T>
            <Button title={mode === 'delivered' ? 'Mark delivered' : 'Mark failed'} variant={mode === 'delivered' ? 'primary' : 'danger'} style={{ marginTop: 12 }} loading={busy}
              disabled={mode === 'delivered' ? !otp && !photos.length : !reason.trim()} onPress={() => send(mode)} />
          </Card>
        </>
      )}
      {!open && <Card style={{ marginTop: 12 }}><T>{d.status === 'delivered' ? `Delivered${d.receiver_name ? ` to ${d.receiver_name}` : ''} ${+d.otp_verified ? '· OTP verified ✓' : ''}` : d.failure_reason ?? d.status}</T></Card>}
      <View style={{ height: 30 }} />
    </Screen>
  );
}
