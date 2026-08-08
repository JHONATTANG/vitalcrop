'use client';
import { useState } from 'react';
import { useAlerts, useMarkAlertsRead } from '@/hooks/useAlerts';
import AlertItem from './AlertItem';
import { Bell, CheckCheck, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AlertSeverity } from '@/types/alert';

type Filter = 'ALL' | AlertSeverity;
const FILTERS: Filter[] = ['ALL', 'CRITICAL', 'WARNING', 'INFO'];

export default function AlertsList() {
  const [filter, setFilter]         = useState<Filter>('ALL');
  const [onlyUnread, setOnlyUnread] = useState(false);
  const { data: alerts, isLoading } = useAlerts();
  const { mutate: markAll }         = useMarkAlertsRead();

  const filtered = (alerts ?? [])
    .filter((a) => filter === 'ALL' || a.severity === filter)
    .filter((a) => !onlyUnread || !a.is_read);

  const unreadIds = (alerts ?? []).filter((a) => !a.is_read).map((a) => a.id);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* Severity filters */}
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all', {
                'bg-brand-red/20    text-brand-red   ': f === 'CRITICAL' && filter === f,
                'bg-brand-yellow/20 text-brand-yellow': f === 'WARNING'  && filter === f,
                'bg-brand-blue/20   text-brand-blue  ': f === 'INFO'     && filter === f,
                'bg-white/10        text-text-primary': f === 'ALL'      && filter === f,
                'text-text-muted hover:text-text-primary hover:bg-white/5': filter !== f,
              })}>
              {f}
            </button>
          ))}
        </div>

        <button onClick={() => setOnlyUnread(!onlyUnread)}
          className={cn('flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all',
            onlyUnread ? 'bg-brand-blue/20 text-brand-blue' : 'text-text-muted hover:text-text-primary hover:bg-white/5')}>
          <Filter size={12} /> Unread only
        </button>

        {unreadIds.length > 0 && (
          <button onClick={() => markAll(unreadIds)}
            className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5 transition-all">
            <CheckCheck size={12} /> Mark all read
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-text-muted gap-3">
          <Bell size={40} className="opacity-20" />
          <p className="text-sm">No alerts to show.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((a) => <AlertItem key={a.id} alert={a} />)}
        </div>
      )}
    </div>
  );
}
