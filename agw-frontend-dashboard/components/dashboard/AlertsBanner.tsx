'use client';
import { useAlerts } from '@/hooks/useAlerts';
import { AlertTriangle, X } from 'lucide-react';
import { useMarkAlertsRead } from '@/hooks/useAlerts';

export default function AlertsBanner() {
  const { data: alerts } = useAlerts(true);
  const critical = alerts?.filter((a) => a.severity === 'CRITICAL') ?? [];
  const { mutate: markRead } = useMarkAlertsRead();

  if (!critical.length) return null;

  return (
    <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 mb-6 shadow-glow_red">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-brand-red flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-brand-red">
            {critical.length} Critical Alert{critical.length > 1 ? 's' : ''}
          </p>
          <ul className="mt-1 space-y-0.5">
            {critical.slice(0, 3).map((a) => (
              <li key={a.id} className="text-xs text-text-secondary truncate">{a.message}</li>
            ))}
          </ul>
        </div>
        <button
          onClick={() => markRead(critical.map((a) => a.id))}
          className="text-text-muted hover:text-text-primary transition-colors"
          title="Dismiss all"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
