import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
  type TextInputProps, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { C, R, SERIF, avatarColor, statusColor } from '../lib/theme';
import { dateOf, dueLabel, overdueLabel, ymd } from '../lib/format';
import { useAuth } from '../lib/auth';
import { notifyInputFocus, useKeyboardAwareScroll, useKeyboardHeight } from '../lib/keyboard';

export function Screen({ children, title, right, back, refreshing, onRefresh, scroll = true, pad = true }: {
  children: ReactNode; title?: string; right?: ReactNode; back?: boolean; refreshing?: boolean; onRefresh?: () => void; scroll?: boolean; pad?: boolean;
}) {
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const { keyboardHeight, onScroll } = useKeyboardAwareScroll(scrollRef);
  const kbStatic = useKeyboardHeight();
  const body = scroll ? (
    <ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[pad && { padding: 16 }, { paddingBottom: 40 + keyboardHeight }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={C.gold} /> : undefined}
    >
      {children}
    </ScrollView>
  ) : (
    // Non-scrolling screens (chat): shrink above the keyboard so the input bar stays visible.
    <View style={[{ flex: 1, paddingBottom: kbStatic }, pad && { padding: 16, paddingBottom: 16 + kbStatic }]}>{children}</View>
  );
  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      {(title || back) && (
        <View style={s.header}>
          {back && <Pressable hitSlop={12} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}><Text style={s.back}>‹</Text></Pressable>}
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <View style={{ marginLeft: 'auto' }}>{right}</View>
        </View>
      )}
      {body}
    </SafeAreaView>
  );
}

export const Card = ({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) =>
  onPress ? <Pressable onPress={onPress} style={({ pressed }) => [s.card, style, pressed && { opacity: 0.85 }]}>{children}</Pressable> : <View style={[s.card, style]}>{children}</View>;

export const T = ({ children, style, muted, b, size, color, numberOfLines }: { children: ReactNode; style?: any; muted?: boolean; b?: boolean; size?: number; color?: string; numberOfLines?: number }) => (
  <Text numberOfLines={numberOfLines} style={[{ color: color ?? (muted ? C.muted : C.text), fontSize: size ?? (muted ? 12.5 : 14), fontWeight: b ? '600' : '400' }, style]}>{children}</Text>
);

export function Avatar({ initials, size = 30 }: { initials: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(initials), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.36 }}>{initials}</Text>
    </View>
  );
}

export function Badge({ s: st, label }: { s: string; label: string }) {
  const [bg, fg] = statusColor(st);
  return <View style={[s.badge, { backgroundColor: bg }]}><Text style={{ color: fg, fontSize: 11, fontWeight: '600' }}>{label}</Text></View>;
}

export function Button({ title, onPress, variant = 'primary', disabled, loading, style, small }: {
  title: string; onPress?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'ok' | 'white'; disabled?: boolean; loading?: boolean; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const bg = { primary: C.gold, ghost: '#fff', danger: C.redSoft, ok: C.greenSoft, white: '#fff' }[variant];
  const fg = { primary: '#fff', ghost: C.text, danger: C.red, ok: C.green, white: C.walnut }[variant];
  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [s.btn, small && s.btnSm, { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }, variant === 'ghost' && { borderWidth: 1, borderColor: C.line }, style]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 12.5 : 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Input({ label, style, error, ...p }: TextInputProps & { label?: string; error?: string | null }) {
  return (
    <>
      <View style={[s.inputWrap, error ? s.inputErr : null, style as any]}>
        {label && <Text style={[s.inputLabel, error ? { color: C.red } : null]}>{label}</Text>}
        <TextInput placeholderTextColor="#B9A994" style={s.input} {...p} onFocus={(e) => { notifyInputFocus(); p.onFocus?.(e); }} />
      </View>
      {error ? <Text style={s.errHint}>{error}</Text> : null}
    </>
  );
}

/** Date typed as DD-MM-YYYY; value / onChange use YYYY-MM-DD ('' while incomplete). */
export function DateField({ label, value, onChange, style, error }: { label: string; value: string; onChange: (ymd: string) => void; style?: any; error?: string | null }) {
  const [txt, setTxt] = useState(value ? dateOf(value) : '');
  useEffect(() => { if (value && ymd(txt) !== value) setTxt(dateOf(value)); if (!value && ymd(txt)) setTxt(''); }, [value]); // eslint-disable-line
  const bad = txt.length >= 8 && !ymd(txt);
  return (
    <Input label={`${label} (DD-MM-YYYY)`} value={txt} placeholder="DD-MM-YYYY" keyboardType="numbers-and-punctuation" maxLength={10} style={style}
      error={error ?? (bad ? 'Write date as DD-MM-YYYY, e.g. 05-12-2026' : null)}
      onChangeText={(v) => {
        let x = v.replace(/[^\d-/.]/g, '');
        if (/^\d{2}$/.test(x) && txt.length < x.length) x += '-';
        else if (/^\d{2}-\d{2}$/.test(x) && txt.length < x.length) x += '-';
        setTxt(x); onChange(ymd(x));
      }} />
  );
}

/** Label/value box that opens a picker (used for Assign to, Due, Priority…) */
export function Select({ label, value, onPress, error }: { label: string; value: string; onPress: () => void; error?: string | null }) {
  return (
    <Pressable onPress={onPress} style={[s.inputWrap, error ? s.inputErr : null]}>
      <Text style={[s.inputLabel, error ? { color: C.red } : null]}>{label}{error ? ` — ${error}` : ''}</Text>
      <Text style={[s.input, { paddingVertical: 2 }]}>{value}</Text>
    </Pressable>
  );
}

export function Chips<V extends string | number>({ items, value, onChange, multi }: {
  items: [V, string, number?][]; value: V | V[]; onChange: (v: any) => void; multi?: boolean;
}) {
  const on = (v: V) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
      {items.map(([v, l, n]) => (
        <Pressable key={String(v)} onPress={() => onChange(multi && Array.isArray(value) ? (on(v) ? value.filter((x) => x !== v) : [...value, v]) : v)}
          style={[s.chip, on(v) && { backgroundColor: C.walnut, borderColor: C.walnut }]}>
          <Text style={{ color: on(v) ? '#fff' : C.text, fontSize: 13 }}>{l}{n !== undefined ? <Text style={{ fontWeight: '700' }}> {n}</Text> : null}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export const Bar = ({ pct, color }: { pct: number; color?: string }) => (
  <View style={s.bar}><View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color ?? C.gold, borderRadius: 6 }} /></View>
);

export const Loading = () => <View style={{ padding: 40 }}><ActivityIndicator color={C.gold} /></View>;
export const Empty = ({ text }: { text: string }) => <Text style={{ textAlign: 'center', color: C.muted, padding: 30 }}>{text}</Text>;
export const ErrorText = ({ msg }: { msg?: string | null }) => (msg ? <View style={s.err}><Text style={{ color: C.red }}>{msg}</Text></View> : null);

export const Section = ({ title, right, children }: { title: string; right?: ReactNode; children?: ReactNode }) => (
  <View style={{ marginTop: 18 }}>
    <View style={[s.row, { justifyContent: 'space-between', marginBottom: 10 }]}><T b size={16}>{title}</T>{right}</View>
    {children}
  </View>
);

export const Row = ({ children, style, gap = 10 }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) => <View style={[s.row, { gap }, style]}>{children}</View>;

const lotus = require('../../assets/logo.png');

/** Keshav lotus mark (gold). `size` = width; the mark is ~0.62 as tall as wide. */
export function Logo({ size = 64 }: { size?: number }) {
  return <Image source={lotus} style={{ width: size, height: size * 0.62 }} resizeMode="contain" accessibilityLabel="Keshav" />;
}

/** Lotus + KESHAV wordmark + trade line. `stacked` = centred (splash/login), otherwise inline for headers. */
export function Brand({ light, stacked, size = 1 }: { light?: boolean; stacked?: boolean; size?: number }) {
  const word = { fontFamily: SERIF, fontWeight: '700' as const, letterSpacing: 2 * size, color: light ? C.goldLight : C.bronze };
  const home = { fontWeight: '700' as const, letterSpacing: 3 * size, color: light ? C.goldLight : C.bronze };
  const line = { fontSize: 6.5 * size, letterSpacing: 1.4 * size, color: light ? '#E6CFA3' : C.gold2 };
  if (stacked) {
    return (
      <View style={{ alignItems: 'center' }}>
        <Logo size={92 * size} />
        <Text style={[word, { fontSize: 38 * size, marginTop: 4 }]}>KESHAV</Text>
        <Text style={[home, { fontSize: 12 * size, marginTop: 2 }]}>HOME SOLUTION</Text>
        <Text style={[line, { marginTop: 6 }]}>CONSTRUCTION SOLUTION · HARDWARE · PAINT · ELECTRICAL</Text>
      </View>
    );
  }
  return (
    <Row gap={8}>
      <Logo size={34} />
      <View>
        <Text style={[word, { fontSize: 17, letterSpacing: 1.5 }]}>KESHAV</Text>
        <Text style={[home, { fontSize: 7.5 }]}>HOME SOLUTION</Text>
      </View>
    </Row>
  );
}

/** Task row used on Home and Tasks — orange left accent for in-progress, red for overdue (as in the design). */
export function TaskCard({ t }: { t: any }) {
  const { t: tr } = useAuth();
  const st = t.display_status as string;
  const accent = st === 'overdue' ? C.red : st === 'in_progress' ? '#F59E0B' : st === 'done' ? C.green : C.line;
  const label = st === 'overdue' ? `${tr('overdue')} ${overdueLabel(t.overdue_minutes)}` : tr(st);
  return (
    <Card onPress={() => router.push(`/task/${t.id}`)} style={{ borderLeftWidth: 3, borderLeftColor: accent, marginBottom: 10 }}>
      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <T b style={{ flex: 1, textDecorationLine: st === 'done' ? 'line-through' : 'none' }} numberOfLines={2}>{t.title}</T>
        <Badge s={st} label={label} />
      </Row>
      <Row style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <T muted>
          {t.repeat_frequency ? `${tr(t.repeat_frequency)} · ` : '⏱ '}{dueLabel(t.due_at, tr)} · <Text style={{ color: t.priority === 'high' || t.priority === 'urgent' ? C.red : t.priority === 'medium' ? C.amber : C.green, fontWeight: t.priority === 'urgent' ? '700' : '400' }}>{t.priority === 'urgent' ? '⚡ ' : ''}{tr(t.priority)}</Text>
          {t.checklist_total ? `  ·  ☑ ${t.checklist_done}/${t.checklist_total}` : ''}
        </T>
        <Avatar initials={t.assignee_initials} size={24} />
      </Row>
    </Card>
  );
}

export const s = StyleSheet.create({
  inputErr: { borderColor: C.red, backgroundColor: '#FFF6F5' },
  errHint: { color: C.red, fontSize: 12, marginTop: -8, marginBottom: 10, marginLeft: 4 },
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10 },
  back: { fontSize: 32, color: C.text, marginTop: -6, paddingRight: 4 },
  title: { fontSize: 20, fontWeight: '700', color: C.text, flexShrink: 1 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: '#EDE3D4' },
  badge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  btn: { borderRadius: R.md, paddingVertical: 14, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSm: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9 },
  inputWrap: { backgroundColor: '#fff', borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  inputLabel: { fontSize: 11, color: C.muted, marginBottom: 2 },
  input: { fontSize: 15, color: C.text, paddingVertical: 2 },
  chip: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 20, backgroundColor: '#fff', borderWidth: 1, borderColor: C.line },
  bar: { height: 6, backgroundColor: '#EFE3CF', borderRadius: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center' },
  err: { backgroundColor: C.redSoft, padding: 10, borderRadius: 10, marginBottom: 10 },
});
