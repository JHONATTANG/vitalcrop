import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, formatDistanceToNow } from 'date-fns';

// ── Tailwind class merge helper ────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Date formatting ────────────────────────────────────────
export function formatDate(iso: string): string {
  return format(new Date(iso), 'MMM d, yyyy HH:mm');
}

export function fromNow(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true });
}

// ── Sensor value formatting ────────────────────────────────
export function formatSensorValue(
  value: number | undefined | null,
  unit: string,
  decimals = 1
): string {
  if (value == null) return '—';
  return `${value.toFixed(decimals)} ${unit}`;
}

// ── Signal strength label ──────────────────────────────────
export function rssiLabel(rssi: number | undefined): string {
  if (rssi == null)   return 'Unknown';
  if (rssi >= -60)    return 'Excellent';
  if (rssi >= -70)    return 'Good';
  if (rssi >= -80)    return 'Fair';
  return 'Poor';
}

// ── Device status color ────────────────────────────────────
export function statusColor(s: string): string {
  switch (s) {
    case 'ONLINE':      return 'text-brand-green';
    case 'OFFLINE':     return 'text-text-secondary';
    case 'MAINTENANCE': return 'text-brand-yellow';
    case 'ERROR':       return 'text-brand-red';
    default:            return 'text-text-muted';
  }
}

// ── Alert severity colors ──────────────────────────────────
export function severityColor(s: string): string {
  switch (s) {
    case 'CRITICAL': return 'text-brand-red';
    case 'WARNING':  return 'text-brand-yellow';
    case 'INFO':     return 'text-brand-blue';
    default:         return 'text-text-secondary';
  }
}

export function severityBg(s: string): string {
  switch (s) {
    case 'CRITICAL': return 'bg-red-500/10  border-red-500/20';
    case 'WARNING':  return 'bg-yellow-500/10 border-yellow-500/20';
    case 'INFO':     return 'bg-blue-500/10  border-blue-500/20';
    default:         return 'bg-white/5 border-white/10';
  }
}
