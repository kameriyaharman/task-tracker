import { useEffect, useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { api, form, type UploadFile } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { useApi } from '../../../lib/hooks';
import { sqlDateTime, timeOf } from '../../../lib/format';
import { currentPosition } from '../../../lib/tracking';
import { pickFile, takePhoto } from '../../../components/media';
import { Button, Card, ErrorText, Input, Loading, Row, Screen, Section, T } from '../../../components/ui';
import { C } from '../../../lib/theme';

/** Complete with proof — photo, file, link and/or location, as the task requires. */
export default function Complete() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useAuth();
  const { data: task } = useApi<any>(`/tasks/${id}`);
  const [photos, setPhotos] = useState<UploadFile[]>([]);
  const [file, setFile] = useState<UploadFile | null>(null);
  const [link, setLink] = useState('');
  const [remarks, setRemarks] = useState('');
  const [loc, setLoc] = useState<{ lat: number; lng: number; at: Date } | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    currentPosition().then((p) => setLoc({ ...p, at: new Date() })).catch((e) => setLocErr(e.message));
  }, []);

  if (!task) return <Screen back title={t('complete_task')}><Loading /></Screen>;
  const need: string[] = (task.proof_type ?? '').split(',').filter(Boolean);

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api(`/tasks/${id}/complete`, {
        body: form({ remarks, link: link || undefined, lat: loc?.lat, lng: loc?.lng }, { photo: photos, file: file ? [file] : null }),
      });
      router.back();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };

  const ready = (!need.includes('photo') || photos.length) && (!need.includes('file') || file) && (!need.includes('link') || link) && (!need.includes('location') || loc);

  return (
    <Screen back title={t('complete_task')}>
      <T b size={17}>{task.title}</T>
      <ErrorText msg={err} />

      <Section title={`${t('photo_proof')}${need.includes('photo') ? ' *' : ''}`}>
        <Row gap={10} style={{ flexWrap: 'wrap' }}>
          {photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 90, height: 90, borderRadius: 12 }} />)}
          <Pressable onPress={async () => { const p = await takePhoto(); if (p) setPhotos([...photos, p]); }}
            style={{ width: 90, height: 90, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: C.gold, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldSoft }}>
            <Text style={{ fontSize: 26 }}>📷</Text>
          </Pressable>
        </Row>
      </Section>

      <Card style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text>📍</Text>
        <T style={{ flex: 1 }} color={loc ? C.green : locErr ? C.red : C.muted}>
          {loc ? `${t('location_captured')} · ${timeOf(sqlDateTime(loc.at))}` : locErr ?? 'Getting location…'}
        </T>
      </Card>

      {(need.includes('file') || need.includes('link')) && (
        <Section title="Proof">
          {need.includes('file') && <Button variant="ghost" title={file ? `📄 ${file.name}` : `📎 ${t('file')} *`} onPress={async () => setFile(await pickFile())} style={{ marginBottom: 10 }} />}
          {need.includes('link') && <Input label="Link *" value={link} onChangeText={setLink} placeholder="https://instagram.com/p/…" autoCapitalize="none" />}
        </Section>
      )}

      <View style={{ marginTop: 14 }}>
        <Input label={t('remarks')} value={remarks} onChangeText={setRemarks} multiline style={{ minHeight: 90 }} placeholder="All 4 machines oiled, belt of M3 loose — informed" />
      </View>
      <Button title={t('submit')} onPress={submit} loading={busy} disabled={!ready} />
    </Screen>
  );
}
