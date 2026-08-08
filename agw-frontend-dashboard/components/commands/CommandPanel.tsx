'use client';
import { useState } from 'react';
import { useDevices } from '@/hooks/useDevices';
import { useLatestTelemetry } from '@/hooks/useLatestTelemetry';
import ActuatorControl from './ActuatorControl';
import CommandHistory from './CommandHistory';
import DeviceStatusBadge from '../devices/DeviceStatusBadge';
import { ChevronDown } from 'lucide-react';

function DeviceSelector({ selected, onSelect, devices }: {
  selected: string; onSelect: (id: string) => void;
  devices: { id: string; device_uid: string; status: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = devices.find((d) => d.id === selected);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)}
        className="flex items-center gap-2 glass px-4 py-2.5 rounded-xl border border-brand-border hover:border-brand-blue/40 transition-all text-sm text-text-primary w-full sm:w-72">
        <span className="flex-1 text-left">{current?.device_uid ?? 'Select device…'}</span>
        <ChevronDown size={15} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 w-full sm:w-72 glass rounded-xl border border-brand-border shadow-card z-20">
          {devices.map((d) => (
            <button key={d.id} onClick={() => { onSelect(d.id); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors text-sm text-text-primary first:rounded-t-xl last:rounded-b-xl">
              {d.device_uid}
              <DeviceStatusBadge status={d.status as any} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CommandPanel() {
  const { data: devices, isLoading } = useDevices();
  const [selectedId, setSelectedId] = useState('');
  const selected = selectedId || devices?.[0]?.id || '';
  const { data: telemetry } = useLatestTelemetry(selected);

  if (isLoading) return <div className="skeleton h-64 rounded-xl" />;
  if (!devices?.length) return (
    <div className="glass rounded-xl p-12 text-center text-text-muted text-sm">
      No devices available.
    </div>
  );

  return (
    <div className="space-y-4">
      <DeviceSelector
        selected={selected}
        onSelect={setSelectedId}
        devices={devices.map((d) => ({ id: d.id, device_uid: d.device_uid, status: d.status }))}
      />
      {selected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ActuatorControl deviceId={selected} telemetry={telemetry ?? null} />
          </div>
          <CommandHistory deviceId={selected} />
        </div>
      )}
    </div>
  );
}
