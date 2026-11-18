import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../lib/auth';
import { LANGUAGES, translate } from '../lib/i18n';
import { Button, Screen, T } from '../components/ui';
import { C } from '../lib/theme';

export default function Language() {
  const { lang, setLang } = useAuth();
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [sel, setSel] = useState(lang);

  return (
    <Screen back={!next}>
      <T b size={24} style={{ marginTop: next ? 30 : 0 }}>{translate(sel, 'choose_language')}</T>
      <T muted style={{ marginBottom: 20, marginTop: 4 }}>{translate(sel, 'change_anytime')}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {LANGUAGES.map((l) => (
          <Pressable key={l.code} onPress={() => setSel(l.code)}
            style={{ width: '48%', paddingVertical: 18, borderRadius: 14, alignItems: 'center', backgroundColor: sel === l.code ? C.indigoSoft : '#fff', borderWidth: 1.5, borderColor: sel === l.code ? C.indigo : C.line }}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: C.text }}>{l.native}</Text>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{l.english}</Text>
          </Pressable>
        ))}
      </View>
      <Button title={translate(sel, 'continue')} style={{ marginTop: 24 }}
        onPress={async () => { await setLang(sel); next ? router.replace(`/${next}` as any) : router.back(); }} />
    </Screen>
  );
}
