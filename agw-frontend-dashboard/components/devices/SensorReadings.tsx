'use client';
import { formatSensorValue } from '@/lib/utils';
import type { TelemetryRecord } from '@/types/telemetry';
import type { DeviceType } from '@/types/device';
import { Thermometer, Droplets, Activity, Zap, FlaskConical, Wifi } from 'lucide-react';

interface Props { telemetry: TelemetryRecord | null; deviceType: DeviceType }

function ReadingCell({ label, value, unit, icon: Icon, warn }: {
  label: string; value: number | undefined; unit: string; icon: any; warn?: boolean
}) {
  return (
    <div className={`glass rounded-xl p-4 ${warn ? 'border-yellow-500/30 shadow-glow_yellow' : ''}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon size={15} className={warn ? 'text-brand-yellow' : 'text-brand-blue'} />
        <span className="text-xs text-text-secondary">{label}</span>
      </div>
      <p className={`text-xl font-bold ${warn ? 'text-brand-yellow' : 'text-text-primary'}`}>
        {formatSensorValue(value, unit)}
      </p>
    </div>
  );
}

export default function SensorReadings({ telemetry, deviceType }: Props) {
  if (!telemetry) return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-xl" />)}
    </div>
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {deviceType === 'SOIL' ? (
        <>
          <ReadingCell label="Temperature" value={telemetry.temperature} unit="°C"  icon={Thermometer} warn={(telemetry.temperature ?? 0) > 33} />
          <ReadingCell label="Humidity"    value={telemetry.humidity}    unit="%"   icon={Droplets} />
          <ReadingCell label="Soil Moist." value={telemetry.soil_moisture} unit="%" icon={Activity}  warn={(telemetry.soil_moisture ?? 100) < 25} />
        </>
      ) : (
        <>
          <ReadingCell label="pH"         value={telemetry.ph}          unit=""       icon={FlaskConical} warn={(telemetry.ph ?? 7) < 5.5 || (telemetry.ph ?? 7) > 7.5} />
          <ReadingCell label="EC"         value={telemetry.ec}          unit="mS/cm" icon={Zap} />
          <ReadingCell label="Water Temp" value={telemetry.water_temp}  unit="°C"    icon={Thermometer} />
          <ReadingCell label="Water Level" value={telemetry.water_level} unit="%"   icon={Droplets} warn={(telemetry.water_level ?? 100) < 20} />
        </>
      )}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Wifi size={15} className="text-text-muted" />
          <span className="text-xs text-text-secondary">Signal</span>
        </div>
        <p className="text-xl font-bold text-text-primary">{telemetry.rssi ?? '—'} <span className="text-sm font-normal text-text-muted">dBm</span></p>
      </div>
    </div>
  );
}
