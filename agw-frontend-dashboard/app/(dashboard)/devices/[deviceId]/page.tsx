'use client';
import { useState } from 'react';
import PageContainer from '@/components/layout/PageContainer';
import SensorReadings from '@/components/devices/SensorReadings';
import TelemetryChart from '@/components/devices/TelemetryChart';
import DeviceStatusBadge from '@/components/devices/DeviceStatusBadge';
import ActuatorControl from '@/components/commands/ActuatorControl';
import CommandHistory from '@/components/commands/CommandHistory';
import { useDevice } from '@/hooks/useDevices';
import { useLatestTelemetry } from '@/hooks/useLatestTelemetry';
import { fromNow } from '@/lib/utils';
import { ArrowLeft, MapPin } from 'lucide-react';
import Link from 'next/link';

interface Props { params: { deviceId: string } }

export default function DeviceDetailPage({ params }: Props) {
  const { deviceId } = params;
  const { data: device,    isLoading } = useDevice(deviceId);
  const { data: telemetry }            = useLatestTelemetry(deviceId);

  if (isLoading) return (
    <PageContainer>
      <div className="space-y-4">
        <div className="skeleton h-24 rounded-xl" />
        <div className="skeleton h-40 rounded-xl" />
      </div>
    </PageContainer>
  );

  if (!device) return (
    <PageContainer>
      <p className="text-text-muted text-sm">Device not found.</p>
    </PageContainer>
  );

  return (
    <PageContainer>
      {/* Back link */}
      <Link href="/devices" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary mb-4 transition-colors">
        <ArrowLeft size={15} /> All Devices
      </Link>

      {/* Device header */}
      <div className="glass rounded-xl p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-lg font-bold text-text-primary">{device.device_uid}</h2>
              <DeviceStatusBadge status={device.status} />
            </div>
            <p className="text-sm text-text-secondary">{device.description ?? '—'}</p>
            {device.location && (
              <p className="text-xs text-text-muted mt-1 flex items-center gap-1">
                <MapPin size={12} /> {device.location}
              </p>
            )}
          </div>
          <div className="text-right text-xs text-text-muted">
            <p>Type: <span className="text-text-secondary font-medium">{device.device_type}</span></p>
            <p>FW: <span className="text-text-secondary">{device.firmware_version ?? '—'}</span></p>
            {device.last_seen && <p>Last seen {fromNow(device.last_seen)}</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        {/* Sensor readings */}
        <div className="lg:col-span-2">
          <SensorReadings telemetry={telemetry ?? null} deviceType={device.device_type} />
        </div>
        {/* Actuator control */}
        <div>
          <ActuatorControl deviceId={device.id} telemetry={telemetry ?? null} />
        </div>
      </div>

      {/* Telemetry chart */}
      <div className="mb-4">
        <TelemetryChart deviceId={device.id} deviceType={device.device_type} />
      </div>

      {/* Command history */}
      <CommandHistory deviceId={device.id} />
    </PageContainer>
  );
}
