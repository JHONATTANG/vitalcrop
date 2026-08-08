'use client';
import { useState } from 'react';
import { useSendCommand } from '@/hooks/useCommands';
import type { TelemetryRecord } from '@/types/telemetry';
import type { CommandType } from '@/types/command';
import { Droplets, ToggleRight, RotateCcw, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { deviceId: string; telemetry: TelemetryRecord | null }

interface BtnConfig {
  label:   string;
  icon:    any;
  onCmd:   CommandType;
  offCmd:  CommandType;
  stateKey: keyof TelemetryRecord;
  color:   string;
}

const BTNS: BtnConfig[] = [
  { label: 'Pump',    icon: Droplets, onCmd: 'ACTIVATE_PUMP',  offCmd: 'DEACTIVATE_PUMP', stateKey: 'pump_active',  color: 'blue' },
  { label: 'Valve 1', icon: ToggleRight, onCmd: 'OPEN_VALVE_1',   offCmd: 'CLOSE_VALVE_1',   stateKey: 'valve_1_open', color: 'green' },
  { label: 'Valve 2', icon: ToggleRight, onCmd: 'OPEN_VALVE_2',   offCmd: 'CLOSE_VALVE_2',   stateKey: 'valve_2_open', color: 'green' },
];

export default function ActuatorControl({ deviceId, telemetry }: Props) {
  const { mutateAsync: sendCommand, isPending } = useSendCommand();
  const [confirm, setConfirm] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  const send = async (commandType: CommandType, label: string) => {
    setConfirm(null);
    try {
      await sendCommand({ device_id: deviceId, command_type: commandType });
      setFeedback(`✓ "${label}" command sent`);
    } catch {
      setFeedback('✗ Failed to send command');
    }
    setTimeout(() => setFeedback(''), 3000);
  };

  return (
    <div className="glass rounded-xl p-4">
      <p className="text-sm font-semibold text-text-primary mb-3">Actuators</p>
      <div className="space-y-2">
        {BTNS.map((btn) => {
          const active = !!(telemetry as any)?.[btn.stateKey];
          const Icon = btn.icon;
          return (
            <div key={btn.label} className={cn(
              'flex items-center justify-between p-3 rounded-lg border transition-all',
              active ? `border-brand-${btn.color}/40 bg-${btn.color}-500/10` : 'border-brand-border bg-bg-primary'
            )}>
              <div className="flex items-center gap-2">
                <Icon size={15} className={active ? `text-brand-${btn.color}` : 'text-text-muted'} />
                <span className="text-sm text-text-primary">{btn.label}</span>
              </div>
              <button
                disabled={isPending}
                onClick={() => setConfirm(btn.label)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-medium transition-all',
                  active
                    ? 'bg-red-500/20 text-brand-red hover:bg-red-500/30'
                    : 'bg-brand-blue/20 text-brand-blue hover:bg-brand-blue/30'
                )}
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : active ? 'Turn Off' : 'Turn On'}
              </button>
            </div>
          );
        })}

        {/* Restart node */}
        <div className="flex items-center justify-between p-3 rounded-lg border border-brand-border bg-bg-primary">
          <div className="flex items-center gap-2">
            <RotateCcw size={15} className="text-text-muted" />
            <span className="text-sm text-text-primary">Restart Node</span>
          </div>
          <button
            onClick={() => setConfirm('RESTART')}
            className="px-3 py-1 rounded-md text-xs font-medium bg-yellow-500/10 text-brand-yellow hover:bg-yellow-500/20 transition-all"
          >
            Restart
          </button>
        </div>
      </div>

      {/* Confirmation modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="glass rounded-2xl p-6 max-w-xs w-full mx-4 shadow-card">
            <p className="text-sm font-semibold text-text-primary mb-1">Confirm Action</p>
            <p className="text-xs text-text-secondary mb-4">
              Send <b className="text-text-primary">{confirm}</b> command to this device?
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirm(null)}
                className="flex-1 py-2 rounded-lg border border-brand-border text-xs text-text-secondary hover:text-text-primary transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  const btn = BTNS.find((b) => b.label === confirm);
                  if (btn) {
                    const t = telemetry as any;
                    send(t?.[btn.stateKey] ? btn.offCmd : btn.onCmd, confirm);
                  } else if (confirm === 'RESTART') {
                    send('RESTART_NODE', 'Restart');
                  }
                }}
                className="flex-1 py-2 rounded-lg bg-brand-blue text-xs text-white hover:bg-blue-500 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {feedback && (
        <p className={cn('mt-2 text-xs text-center', feedback.startsWith('✓') ? 'text-brand-green' : 'text-brand-red')}>
          {feedback}
        </p>
      )}
    </div>
  );
}
