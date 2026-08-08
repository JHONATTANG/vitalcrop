'use client';
import { useLatestTelemetry } from '@/hooks/useLatestTelemetry';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { format } from 'date-fns';
import type { DeviceType } from '@/types/device';

interface Props {
  deviceId:   string;
  deviceUid:  string;
  deviceType: DeviceType;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value}</b></p>
      ))}
    </div>
  );
};

export default function LiveChart({ deviceId, deviceUid, deviceType }: Props) {
  const { data: telemetry } = useLatestTelemetry(deviceId);

  // For a live "sparkline" effect we just show the single latest point
  // In production you'd accumulate a rolling buffer via useTelemetryHistory
  const value = deviceType === 'SOIL'
    ? telemetry?.temperature
    : telemetry?.ph;
  const label = deviceType === 'SOIL' ? 'Temperature (°C)' : 'pH';
  const color = deviceType === 'SOIL' ? '#3B82F6' : '#10B981';
  const threshold = deviceType === 'SOIL' ? 35 : 7;

  const chartData = value != null
    ? [{ time: format(new Date(), 'HH:mm'), value }]
    : [];

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-semibold text-text-primary">{deviceUid}</p>
          <p className="text-xs text-text-muted">{label} — Live</p>
        </div>
        {value != null && (
          <span className="text-xl font-bold" style={{ color }}>
            {value.toFixed(1)}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={90}>
        <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <defs>
            <linearGradient id={`grad-${deviceId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0}   />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1F2D45" />
          <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} />
          <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={threshold} stroke="#EF4444" strokeDasharray="4 4" strokeOpacity={0.5} />
          <Area type="monotone" dataKey="value" name={label}
            stroke={color} fill={`url(#grad-${deviceId})`} strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
