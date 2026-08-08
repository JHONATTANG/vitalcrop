'use client';
import { useCommands } from '@/hooks/useCommands';
import { fromNow } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { CommandStatus } from '@/types/command';
import { Clock, CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react';

const STATUS_STYLES: Record<CommandStatus, { label: string; cls: string; icon: any }> = {
  PENDING:  { label: 'Pending',  cls: 'text-brand-yellow', icon: Clock },
  SENT:     { label: 'Sent',     cls: 'text-brand-blue',   icon: Loader2 },
  EXECUTED: { label: 'Done',     cls: 'text-brand-green',  icon: CheckCircle2 },
  FAILED:   { label: 'Failed',   cls: 'text-brand-red',    icon: XCircle },
  EXPIRED:  { label: 'Expired',  cls: 'text-text-muted',   icon: AlertCircle },
};

export default function CommandHistory({ deviceId }: { deviceId: string }) {
  const { data: commands, isLoading } = useCommands(deviceId);

  return (
    <div className="glass rounded-xl p-4">
      <p className="text-sm font-semibold text-text-primary mb-3">Command History</p>
      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}</div>
      ) : !commands?.length ? (
        <p className="text-xs text-text-muted text-center py-6">No commands sent yet.</p>
      ) : (
        <div className="space-y-1 max-h-60 overflow-y-auto">
          {commands.slice(0, 20).map((cmd) => {
            const s = STATUS_STYLES[cmd.status];
            const Icon = s.icon;
            return (
              <div key={cmd.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={14} className={cn(s.cls, cmd.status === 'SENT' && 'animate-spin')} />
                  <span className="text-xs text-text-primary truncate">{cmd.command_type.replace(/_/g, ' ')}</span>
                </div>
                <div className="text-right flex-shrink-0 ml-4">
                  <span className={cn('text-[10px] font-medium', s.cls)}>{s.label}</span>
                  <p className="text-[10px] text-text-muted">{fromNow(cmd.created_at)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
