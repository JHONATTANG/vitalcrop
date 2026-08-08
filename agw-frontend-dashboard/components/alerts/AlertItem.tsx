'use client';
import { fromNow, severityBg, severityColor } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { useMarkAlertsRead } from '@/hooks/useAlerts';
import type { Alert } from '@/types/alert';
import { AlertTriangle, Info, Zap, CheckCheck } from 'lucide-react';

const ICONS = { CRITICAL: Zap, WARNING: AlertTriangle, INFO: Info };

export default function AlertItem({ alert, onMark }: { alert: Alert; onMark?: () => void }) {
  const { mutate: markRead, isPending } = useMarkAlertsRead();
  const Icon = ICONS[alert.severity] ?? Info;

  return (
    <div className={cn(
      'flex items-start gap-3 p-4 rounded-xl border transition-all',
      severityBg(alert.severity),
      !alert.is_read ? 'opacity-100' : 'opacity-50'
    )}>
      <Icon size={16} className={cn('flex-shrink-0 mt-0.5', severityColor(alert.severity))} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={cn('text-[10px] font-bold uppercase tracking-wider', severityColor(alert.severity))}>
            {alert.severity}
          </span>
          <span className="text-[10px] text-text-muted">{alert.alert_type}</span>
        </div>
        <p className="text-xs text-text-primary">{alert.message}</p>
        <p className="text-[10px] text-text-muted mt-1">{fromNow(alert.created_at)}</p>
      </div>
      {!alert.is_read && (
        <button
          onClick={() => { markRead([alert.id]); onMark?.(); }}
          disabled={isPending}
          title="Mark as read"
          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-white/10 text-text-muted hover:text-text-primary transition-colors"
        >
          <CheckCheck size={14} />
        </button>
      )}
    </div>
  );
}
