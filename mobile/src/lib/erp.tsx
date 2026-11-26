import { dateOf } from './format';
import { Text } from 'react-native';
import { Badge } from '../components/ui';

export const rs = (n: any, dec = 0) => '₹' + Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: dec, maximumFractionDigits: dec ? 2 : 0 });
export const qty = (n: any) => { const v = Number(n ?? 0); return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/0+$/, ''); };
export const d8 = (s?: string | null) => dateOf(s) || '—';

const MAP: Record<string, [string, string]> = {
  pending: ['pending', 'Pending'], packed: ['field', 'Packed'], dispatched: ['in_progress', 'On the way'], delivered: ['done', 'Delivered'],
  partial: ['pending', 'Partial'], failed: ['rejected', 'Failed'], cancelled: ['', 'Cancelled'], approved: ['approved', 'Approved'],
  pending_approval: ['pending', 'Waiting approval'], rejected: ['rejected', 'Rejected'], ordered: ['field', 'Ordered'],
};
export const St = ({ s }: { s: string }) => { const [c, l] = MAP[s] ?? ['', s]; return <Badge s={c} label={l} />; };
export const canErp = (perms: Record<string, string> | undefined, mod: string, write = false) => {
  const p = perms?.[mod];
  return write ? p === 'edit' : p === 'view' || p === 'edit';
};
export const Money = ({ v, color }: { v: any; color?: string }) => <Text style={{ fontWeight: '700', color }}>{rs(v)}</Text>;
