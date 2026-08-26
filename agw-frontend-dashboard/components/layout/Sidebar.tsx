'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/store/useAppStore';
import {
  LayoutDashboard, Cpu, Terminal, Bell, Activity, Server,
  ChevronLeft, ChevronRight, Leaf,
} from 'lucide-react';

const NAV = [
  { href: '/dashboard', label: 'Resumen',            icon: LayoutDashboard },
  // El eje evaluativo del proyecto (MCD §9). Va arriba, junto al
  // resumen, y no al final con las utilidades: es lo que se mide.
  { href: '/telecom',   label: 'Telecomunicaciones', icon: Activity },
  { href: '/fog',       label: 'Nodo fog',           icon: Server },
  { href: '/devices',   label: 'Dispositivos',       icon: Cpu },
  { href: '/commands',  label: 'Control',            icon: Terminal },
  { href: '/alerts',    label: 'Alertas',            icon: Bell },
];

export default function Sidebar() {
  const pathname   = usePathname();
  const { sidebarCollapsed: col, toggleSidebar } = useAppStore();

  return (
    <aside
      className={cn(
        'flex flex-col h-full border-r border-brand-border bg-bg-secondary transition-all duration-300',
        col ? 'w-16' : 'w-56'
      )}
    >
      {/* Logo */}
      <div className={cn('flex items-center gap-3 px-4 py-5 border-b border-brand-border', col && 'justify-center px-0')}>
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-green/20 flex items-center justify-center">
          <Leaf size={18} className="text-brand-green" />
        </div>
        {!col && (
          <div>
            <p className="text-sm font-bold text-text-primary leading-none">VitalCrop</p>
            <p className="text-[10px] text-text-muted">Panel AGW</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group',
                active
                  ? 'bg-gradient-to-r from-blue-600/20 to-blue-400/5 text-brand-blue border border-blue-500/20'
                  : 'text-text-secondary hover:text-text-primary hover:bg-white/5',
                col && 'justify-center px-0'
              )}
            >
              <Icon size={18} className={cn(active ? 'text-brand-blue' : 'group-hover:text-text-primary')} />
              {!col && <span>{label}</span>}
              {active && !col && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-brand-blue" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="flex items-center justify-center h-10 border-t border-brand-border text-text-muted hover:text-text-primary transition-colors"
        aria-label="Plegar o desplegar el menú"
      >
        {col ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </aside>
  );
}
