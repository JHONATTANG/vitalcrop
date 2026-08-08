'use client';
import { cn } from '@/lib/utils';
import type { DeviceStatus } from '@/types/device';

const CONFIG: Record<DeviceStatus, { label: string; color: string; dot: string }> = {
  ONLINE:      { label: 'Online',      color: 'text-brand-green bg-green-500/10 border-green-500/20',  dot: 'bg-brand-green animate-pulse_ring' },
  OFFLINE:     { label: 'Offline',     color: 'text-text-muted bg-white/5 border-brand-border',         dot: 'bg-text-muted' },
  MAINTENANCE: { label: 'Maintenance', color: 'text-brand-yellow bg-yellow-500/10 border-yellow-500/20', dot: 'bg-brand-yellow' },
  ERROR:       { label: 'Error',       color: 'text-brand-red bg-red-500/10 border-red-500/20',          dot: 'bg-brand-red' },
};

export default function DeviceStatusBadge({ status }: { status: DeviceStatus }) {
  const c = CONFIG[status] ?? CONFIG.OFFLINE;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border', c.color)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.dot)} />
      {c.label}
    </span>
  );
}
