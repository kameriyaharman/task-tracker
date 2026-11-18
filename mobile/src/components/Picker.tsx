import { useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { C } from '../lib/theme';
import { Avatar } from './ui';

export type Option = { value: any; label: string; sub?: string; initials?: string };

/** Bottom-sheet list picker (people, priority, leave type…) */
export function Picker({ visible, title, options, onPick, onClose, search }: {
  visible: boolean; title: string; options: Option[]; onPick: (v: any) => void; onClose: () => void; search?: boolean;
}) {
  const [q, setQ] = useState('');
  const list = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(43,26,16,.35)' }} onPress={onClose} />
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: '70%' }}>
        <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 12, color: C.text }}>{title}</Text>
        {search && <TextInput value={q} onChangeText={setQ} placeholder="Search…" style={{ borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 10, marginBottom: 10 }} />}
        <FlatList
          data={list}
          keyExtractor={(o) => String(o.value)}
          renderItem={({ item }) => (
            <Pressable onPress={() => { onPick(item.value); onClose(); setQ(''); }} style={{ paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F1E8DB' }}>
              {item.initials && <Avatar initials={item.initials} size={28} />}
              <View>
                <Text style={{ fontSize: 15, color: C.text }}>{item.label}</Text>
                {item.sub && <Text style={{ fontSize: 12, color: C.muted }}>{item.sub}</Text>}
              </View>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

/** Simple date + time chooser without extra native deps: quick choices + day/hour steppers. */
export function DuePicker({ visible, value, onPick, onClose }: { visible: boolean; value: Date; onPick: (d: Date) => void; onClose: () => void }) {
  const [d, setD] = useState(value);
  const set = (fn: (x: Date) => void) => { const n = new Date(d); fn(n); setD(n); };
  const quick: [string, () => Date][] = [
    ['Today 6 PM', () => { const n = new Date(); n.setHours(18, 0, 0, 0); return n; }],
    ['In 2 hours', () => { const n = new Date(Date.now() + 7200000); n.setMinutes(0, 0, 0); return n; }],
    ['Tomorrow 11 AM', () => { const n = new Date(); n.setDate(n.getDate() + 1); n.setHours(11, 0, 0, 0); return n; }],
    ['Tomorrow 6 PM', () => { const n = new Date(); n.setDate(n.getDate() + 1); n.setHours(18, 0, 0, 0); return n; }],
  ];
  const Step = ({ label, onMinus, onPlus }: { label: string; onMinus: () => void; onPlus: () => void }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 }}>
      <Pressable onPress={onMinus} hitSlop={10}><Text style={{ fontSize: 26, color: C.gold, width: 40, textAlign: 'center' }}>−</Text></Pressable>
      <Text style={{ fontSize: 16, fontWeight: '600', color: C.text }}>{label}</Text>
      <Pressable onPress={onPlus} hitSlop={10}><Text style={{ fontSize: 26, color: C.gold, width: 40, textAlign: 'center' }}>+</Text></Pressable>
    </View>
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(43,26,16,.35)' }} onPress={onClose} />
      <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18 }}>
        <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 12, color: C.text }}>Due</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
          {quick.map(([l, f]) => (
            <Pressable key={l} onPress={() => setD(f())} style={{ borderWidth: 1, borderColor: C.line, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 }}>
              <Text>{l}</Text>
            </Pressable>
          ))}
        </View>
        <Step label={d.toDateString()} onMinus={() => set((x) => x.setDate(x.getDate() - 1))} onPlus={() => set((x) => x.setDate(x.getDate() + 1))} />
        <Step label={d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} onMinus={() => set((x) => x.setMinutes(x.getMinutes() - 30))} onPlus={() => set((x) => x.setMinutes(x.getMinutes() + 30))} />
        <Pressable onPress={() => { onPick(d); onClose(); }} style={{ backgroundColor: C.gold, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}
