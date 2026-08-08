'use client';
import { formatSensorValue, fromNow } from '@/lib/utils';
import DeviceStatusBadge from './DeviceStatusBadge';
import type { IoTDevice } from '@/types/device';
import { MapPin, Cpu, Wifi } from 'lucide-react';

export default function DeviceCard({ device }: { device: IoTDevice }) {
  return (
    <div className="glass rounded-xl p-4 hover:border-brand-blue/40 border border-transparent transition-all duration-200 hover:-translate-y-1 cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-brand-blue/10 flex items-center justify-center">
            <Cpu size={16} className="text-brand-blue" />
          </div>
          <div>
            <p className="text-sm font-semibold text-text-primary">{device.device_uid}</p>
            <p className="text-[10px] text-text-muted uppercase tracking-wide">{device.device_type}</p>
          </div>
        </div>
        <DeviceStatusBadge status={device.status} />
      </div>

      {device.location && (
        <p className="text-xs text-text-muted flex items-center gap-1 mb-2">
          <MapPin size={11} /> {device.location}
        </p>
      )}

      <div className="flex items-center justify-between text-xs text-text-muted border-t border-brand-border pt-2 mt-2">
        <span className="flex items-center gap-1"><Wifi size={11} /> {device.firmware_version ?? '—'}</span>
        <span>{device.last_seen ? fromNow(device.last_seen) : 'Never seen'}</span>
      </div>
    </div>
  );
}
