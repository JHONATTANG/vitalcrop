'use client';
import { useUser } from '@/hooks/useUser';
import PageContainer from '@/components/layout/PageContainer';
import MetricCard from '@/components/dashboard/MetricCard';
import DeviceStatusGrid from '@/components/dashboard/DeviceStatusGrid';
import TempHumidityChart from '@/components/charts/TempHumidityChart';
import PhChart from '@/components/charts/PhChart';
import WateringMoistureChart from '@/components/charts/WateringMoistureChart';
import SensorDistributionChart from '@/components/charts/SensorDistributionChart';
import { useTelemetry } from '@/hooks/useTelemetry';
import AlertsBanner from '@/components/dashboard/AlertsBanner';
import { useDevices } from '@/hooks/useDevices';
import { useAlerts } from '@/hooks/useAlerts';
import { useCommands } from '@/hooks/useCommands';
import { Cpu, Thermometer, Bell, Terminal } from 'lucide-react';
import { fromNow } from '@/lib/utils';

export default function DashboardPage() {
  const { data: user }  = useUser();
  const { data: devices  } = useDevices();
  const { data: alerts   } = useAlerts(true);
  const { data: commands } = useCommands();

  const online   = devices?.filter((d) => d.status === 'ONLINE').length ?? 0;
  const total    = devices?.length ?? 0;
  const unread   = alerts?.length ?? 0;
  const pending  = commands?.filter((c) => c.status === 'PENDING').length ?? 0;

  return (
    <PageContainer>
      {/* Welcome row */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">
            Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h2>
          <p className="text-sm text-text-secondary mt-0.5">
            System overview · Updated {fromNow(new Date().toISOString())}
          </p>
        </div>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard title="Devices Online" value={`${online}/${total}`} icon={Cpu}
          status={online === total ? 'normal' : online === 0 ? 'critical' : 'warning'} />
        <MetricCard title="Avg Temperature" value="—" unit="°C" icon={Thermometer} status="normal" />
        <MetricCard title="Active Alerts"   value={unread} icon={Bell}
          status={unread === 0 ? 'normal' : unread > 5 ? 'critical' : 'warning'} />
        <MetricCard title="Pending Commands" value={pending} icon={Terminal}
          status={pending === 0 ? 'normal' : 'warning'} />
      </div>

      {/* Critical alerts banner */}
      <AlertsBanner />

      {/* Device status grid */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
          Device Status
        </h3>
        <DeviceStatusGrid />
      </div>

      {/* Advanced ECharts Visualization Suite */}
      {devices && devices.length > 0 && (
        <DashboardCharts deviceId={devices[0]?.id} />
      )}
    </PageContainer>
  );
}

function DashboardCharts({ deviceId }: { deviceId: string }) {
  const { data: telemetry } = useTelemetry(deviceId);

  if (!telemetry || telemetry.length === 0) {
    return <div className="p-4 text-center text-text-muted mt-6 glass rounded-xl">Waiting for telemetry data...</div>;
  }

  return (
    <div className="space-y-6 mt-6">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider mb-3">
        Advanced Telemetry Analysis
      </h3>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* A. Temp & Humidity */}
        <div className="glass rounded-xl p-4">
          <h4 className="text-sm font-medium text-text-primary mb-4">Temperature & Humidity (Gradient Stacked Area)</h4>
          <TempHumidityChart data={telemetry} />
        </div>

        {/* B. pH Anomalies */}
        <div className="glass rounded-xl p-4">
          <h4 className="text-sm font-medium text-text-primary mb-4">Water pH Analysis (Gradient Y-axis)</h4>
          <PhChart data={telemetry} />
        </div>

        {/* C. Watering & Moisture */}
        <div className="glass rounded-xl p-4 xl:col-span-2">
          <h4 className="text-sm font-medium text-text-primary mb-4">Watering & Soil Moisture Relationship (Mixed Line/Bar)</h4>
          <WateringMoistureChart data={telemetry} />
        </div>

        {/* D. Statistical Distribution */}
        <div className="glass rounded-xl p-4 xl:col-span-2">
          <h4 className="text-sm font-medium text-text-primary mb-4">Sensor Statistical Distribution (Boxplot)</h4>
          <SensorDistributionChart data={telemetry} />
        </div>
      </div>
    </div>
  );
}
