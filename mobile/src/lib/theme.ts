export const C = {
  navy: '#1C1A4A',
  navy2: '#2B2878',
  indigo: '#5B5BD6',
  indigo2: '#4F46E5',
  indigoSoft: '#ECEAFD',
  bg: '#F4F3EF',
  card: '#FFFFFF',
  line: '#ECEAE4',
  text: '#1C1A33',
  muted: '#7A788C',
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
    case 'field': case 'leave': case 'visit': return [C.indigoSoft, C.indigo];
    default: return ['#F0EFE9', C.muted];
  }
};

const palette = ['#5B5BD6', '#0EA5E9', '#16A34A', '#D97706', '#DB2777', '#7C3AED', '#0891B2', '#DC2626'];
export const avatarColor = (i: string) => palette[((i.charCodeAt(0) || 0) + (i.charCodeAt(1) || 0)) % palette.length];
