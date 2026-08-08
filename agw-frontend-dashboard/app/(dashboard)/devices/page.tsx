'use client';
import Link from 'next/link';
import PageContainer from '@/components/layout/PageContainer';
import DeviceCard from '@/components/devices/DeviceCard';
import { useDevices } from '@/hooks/useDevices';
import { Cpu } from 'lucide-react';

function Skeleton() {
  return <div className="rounded-xl h-40 skeleton" />;
}

export default function DevicesPage() {
  const { data: devices, isLoading } = useDevices();

  return (
    <PageContainer>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-text-primary">IoT Devices</h2>
          <p className="text-sm text-text-secondary">
            {devices?.length ?? '…'} registered device{devices?.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : devices?.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-text-muted gap-3">
          <Cpu size={40} className="opacity-30" />
          <p className="text-sm">No devices registered yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {devices?.map((d) => (
            <Link key={d.id} href={`/devices/${d.id}`}>
              <DeviceCard device={d} />
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
