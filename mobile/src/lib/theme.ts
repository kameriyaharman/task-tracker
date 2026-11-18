import { Platform } from 'react-native';

export const C = {
  walnut: '#2B1A10',
  walnut2: '#4A2E1B',
  gold: '#A8722C',
  gold2: '#8C5A22',
  goldSoft: '#F6EAD3',
  goldLight: '#E8C77A',
  bronze: '#6B3A1C',
  bg: '#F6F0E6',
  card: '#FFFFFF',
  line: '#E6DACA',
  text: '#2A1A10',
  muted: '#8A7663',
  green: '#16A34A',
  greenSoft: '#E3F6EA',
  red: '#DC2626',
  redSoft: '#FDE8E8',
  amber: '#B7791F',
  amberSoft: '#FDF3D8',
  white: '#FFFFFF',
};

export const R = { sm: 8, md: 12, lg: 16, xl: 22 };

export const statusColor = (s: string): [string, string] => {
  switch (s) {
    case 'overdue': case 'high': case 'rejected': case 'absent': case 'behind': return [C.redSoft, C.red];
    case 'in_progress': case 'late': case 'medium': case 'pending': case 'at_risk': case 'travelling': return [C.amberSoft, C.amber];
    case 'done': case 'present': case 'approved': case 'on_track': case 'inside': case 'low': return [C.greenSoft, C.green];
    case 'field': case 'leave': case 'visit': return [C.goldSoft, C.gold];
    default: return ['#F1E9DC', C.muted];
  }
};

const palette = ['#A8722C', '#6B3A1C', '#B5562F', '#7A6A2E', '#2F6B5E', '#8C5A22', '#5A3820', '#9C4A3A'];
export const avatarColor = (i: string) => palette[((i.charCodeAt(0) || 0) + (i.charCodeAt(1) || 0)) % palette.length];

/** Serif face for the KESHAV wordmark (system fonts — no download needed). */
export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif', default: 'serif' });
