'use client';
import { useDevices } from '@/hooks/useDevices';
import { useLatestTelemetry } from '@/hooks/useLatestTelemetry';
import DeviceStatusBadge from '@/components/devices/DeviceStatusBadge';
import { formatSensorValue } from '@/lib/utils';
import Link from 'next/link';
import { Cpu } from 'lucide-react';

function DeviceItem({ deviceId, deviceUid, deviceType, status, location }: {
  deviceId: string; deviceUid: string; deviceType: string;
  status: string; location: string | null;
}) {
  const { data: t } = useLatestTelemetry(deviceId);

  return (
    <Link href={`/devices/${deviceId}`}
      className="glass rounded-xl p-4 hover:border-brand-blue/40 border border-transparent transition-all duration-200 hover:-translate-y-0.5 block">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{deviceUid}</p>
          <p className="text-xs text-text-muted">{location ?? '—'}</p>
        </div>
        <DeviceStatusBadge status={status as any} />
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-text-secondary">
        {deviceType === 'SOIL' ? (
          <>
            <span>Temp: <b className="text-text-primary">{formatSensorValue(t?.temperature, '°C')}</b></span>
            <span>Hum: <b className="text-text-primary">{formatSensorValue(t?.humidity, '%')}</b></span>
            <span>Soil: <b className="text-text-primary">{formatSensorValue(t?.soil_moisture, '%')}</b></span>
          </>
        ) : (
          <>
            <span>pH: <b className="text-text-primary">{formatSensorValue(t?.ph, '', 2)}</b></span>
            <span>EC: <b className="text-text-primary">{formatSensorValue(t?.ec, 'mS/cm', 2)}</b></span>
            <span>Level: <b className="text-text-primary">{formatSensorValue(t?.water_level, '%')}</b></span>
          </>
        )}
      </div>
    </Link>
  );
}

export default function DeviceStatusGrid() {
  const { data: devices, isLoading } = useDevices();

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
    </div>
  );

  if (!devices?.length) return (
    <div className="flex items-center gap-2 text-text-muted text-sm py-8 justify-center">
      <Cpu size={18} className="opacity-40" />
      No devices found.
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {devices.map((d) => (
        <DeviceItem key={d.id} deviceId={d.id} deviceUid={d.device_uid}
          deviceType={d.device_type} status={d.status} location={d.location} />
      ))}
    </div>
  );
}
