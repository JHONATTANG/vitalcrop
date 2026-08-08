'use client';
import { useState } from 'react';
import { useTelemetryHistory, TimeRange } from '@/hooks/useTelemetryHistory';
import type { DeviceType } from '@/types/device';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const RANGES: TimeRange[] = ['1h', '6h', '24h', '7d', '30d'];

const SOIL_SERIES  = [
  { key: 'avg_temp',     name: 'Temp (°C)',   color: '#3B82F6' },
  { key: 'avg_humidity', name: 'Humidity (%)', color: '#10B981' },
  { key: 'avg_moisture', name: 'Moisture (%)',  color: '#F59E0B' },
];

const HYDRO_SERIES = [
  { key: 'avg_ph',  name: 'pH',      color: '#10B981' },
  { key: 'avg_ec',  name: 'EC',      color: '#3B82F6' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-lg px-3 py-2 text-xs shadow-card">
      <p className="text-text-muted mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>{p.name}: <b>{p.value?.toFixed(2)}</b></p>
      ))}
    </div>
  );
};

export default function TelemetryChart({ deviceId, deviceType }: { deviceId: string; deviceType: DeviceType }) {
  const [range, setRange] = useState<TimeRange>('24h');
  const { data, isLoading } = useTelemetryHistory(deviceId, range);
  const series = deviceType === 'SOIL' ? SOIL_SERIES : HYDRO_SERIES;

  const chartData = (data ?? []).map((b) => ({
    ...b,
    time: format(new Date(b.bucket), 'HH:mm'),
  }));

  return (
    <div className="glass rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-text-primary">Historical Telemetry</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button key={r} onClick={() => setRange(r)}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium transition-all',
                range === r ? 'bg-brand-blue text-white' : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              )}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="skeleton h-48 rounded-lg" />
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
            <defs>
              {series.map((s) => (
                <linearGradient key={s.key} id={`g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={s.color} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={s.color} stopOpacity={0}    />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1F2D45" />
            <XAxis dataKey="time" tick={{ fontSize: 10, fill: '#64748B' }} />
            <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
            {series.map((s) => (
              <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                stroke={s.color} fill={`url(#g-${s.key})`} strokeWidth={2} dot={false} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
