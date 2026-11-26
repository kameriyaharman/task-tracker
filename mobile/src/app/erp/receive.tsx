import { useState } from 'react';
import { Image, View } from 'react-native';
import { router } from 'expo-router';
import { api, form, type UploadFile } from '../../lib/api';
import { useApi } from '../../lib/hooks';
import { takePhoto } from '../../components/media';
import { Button, Card, Empty, ErrorText, Input, Loading, Row, Screen, T } from '../../components/ui';
import { d8, qty, rs } from '../../lib/erp';
import { C } from '../../lib/theme';

/** Store incharge: receive material against an approved purchase order. */
export default function ReceiveGoods() {
  const pos = useApi<any[]>('/erp/purchase-orders');
  const [po, setPo] = useState<any>(null);
  const [lines, setLines] = useState<any[]>([]);
  const [bill, setBill] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<UploadFile[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (p: any) => {
    setErr(null);
    try {
      const full = await api(`/erp/purchase-orders/${p.id}`);
      setPo(full);
      const left = (i: any) => Number(i.pending_qty ?? Number(i.qty) - Number(i.received_qty));
      setLines(full.items.filter((i: any) => left(i) > 0).map((i: any) => ({ ...i, pending: left(i), got: String(left(i)), bad: '0' })));
      const waiting = full.items.filter((i: any) => Number(i.awaiting_qty) > 0).length;
      if (waiting && !full.items.some((i: any) => left(i) > 0)) setErr('Everything on this PO is already entered in a GRN that is waiting for approval. Approve it in Approvals.');
    } catch (e) { setErr((e as Error).message); }
  };
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const fd = form({ po_id: po.id, bill_no: bill, notes }, { photos });
      lines.forEach((l, i) => {
        fd.append(`items[${i}][product_id]`, String(l.product_id));
        fd.append(`items[${i}][po_item_id]`, String(l.id));
        fd.append(`items[${i}][qty]`, String(Number(l.got || 0)));
        fd.append(`items[${i}][damaged_qty]`, String(Number(l.bad || 0)));
        fd.append(`items[${i}][rate]`, String(l.rate));
      });
      const g = await api('/erp/grns', { body: fd });
      setPo(null); setPhotos([]); setBill(''); setNotes('');
      pos.reload();
      setErr(null);
      router.replace({ pathname: '/erp', params: { done: g.grn_no } } as any);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const open = (pos.data ?? []).filter((p) => ['approved', 'ordered', 'partial'].includes(p.status));
  if (!po) return (
    <Screen back title="Receive goods" refreshing={pos.loading} onRefresh={pos.reload}>
      <ErrorText msg={err} />
      <T muted style={{ marginBottom: 8 }}>Pick the purchase order the material came for.</T>
      {!pos.data ? <Loading /> : open.length ? open.map((p) => (
        <Card key={p.id} style={{ marginBottom: 8 }} onPress={() => pick(p)}>
          <Row><T b style={{ flex: 1 }}>{p.vendor_name}</T><T>{rs(p.total)}</T></Row>
          <T muted size={12}>{p.po_no} · {d8(p.order_date)} · received {qty(p.received)} / {qty(p.qty)}</T>
        </Card>
      )) : <Empty text="No approved purchase orders waiting" />}
    </Screen>
  );
  return (
    <Screen back title={po.po_no}>
      <ErrorText msg={err} />
      <T b>{po.vendor_name}</T>
      {lines.map((l, i) => (
        <Card key={l.id} style={{ marginTop: 10 }}>
          <T b>{l.product_name}</T>
          <T muted size={12}>Pending {qty(l.pending)} {l.unit}{Number(l.awaiting_qty) > 0 ? ` · ${qty(l.awaiting_qty)} already in a GRN waiting approval` : ''}</T>
          <Row>
            <Input label="Good qty" keyboardType="numeric" value={l.got} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, got: v } : x)))} style={{ flex: 1 }} />
            <Input label="Damaged" keyboardType="numeric" value={l.bad} onChangeText={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, bad: v, got: String(Math.max(0, Math.min(Number(x.got || 0), x.pending - Number(v || 0)))) } : x)))} style={{ flex: 1 }} />
          </Row>
          {Number(l.got || 0) + Number(l.bad || 0) > l.pending && <T color={C.red} size={12}>Good + damaged ({qty(Number(l.got || 0) + Number(l.bad || 0))}) is more than pending ({qty(l.pending)})</T>}
        </Card>
      ))}
      <Input label="Vendor bill no." value={bill} onChangeText={setBill} style={{ marginTop: 10 }} />
      <Input label="Notes (shortage, quality…)" value={notes} onChangeText={setNotes} />
      <Row style={{ flexWrap: 'wrap' }}>
        {photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />)}
        <Button small variant="ghost" title="📷 Photo of material / bill" onPress={async () => { const p = await takePhoto(); if (p) setPhotos([...photos, p]); }} />
      </Row>
      <T muted size={12} style={{ marginTop: 8 }}>Stock is added after the manager approves this GRN.</T>
      <Button title="Save GRN" loading={busy} style={{ marginTop: 12 }} onPress={save} />
      <Button title="Choose another PO" variant="ghost" small style={{ marginTop: 8 }} onPress={() => setPo(null)} />
      <View style={{ height: 30 }} />
    </Screen>
  );
}
