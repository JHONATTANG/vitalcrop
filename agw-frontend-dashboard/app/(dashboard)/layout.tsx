'use client';
import { usePathname } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';

const TITULOS: Record<string, string> = {
  '/dashboard': 'Resumen del cultivo',
  '/telecom':   'Telecomunicaciones',
  '/fog':       'Nodo fog · autonomía del borde',
  '/devices':   'Dispositivos',
  '/commands':  'Centro de control',
  '/alerts':    'Alertas y eventos',
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title    = Object.entries(TITULOS).find(([k]) => pathname.startsWith(k))?.[1] ?? 'VitalCrop';

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header title={title} />
        {children}
      </div>
    </div>
  );
}
