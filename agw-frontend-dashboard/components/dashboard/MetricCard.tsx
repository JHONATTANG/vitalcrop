'use client';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface MetricCardProps {
  title:       string;
  value:       string | number;
  unit?:       string;
  icon:        LucideIcon;
  trend?:      'up' | 'down' | 'stable';
  trendValue?: string;
  status?:     'normal' | 'warning' | 'critical';
}

const STATUS_STYLES = {
  normal:   { border: 'border-l-brand-green', glow: '', icon: 'text-brand-green', bg: 'bg-brand-green/10' },
  warning:  { border: 'border-l-brand-yellow', glow: 'shadow-glow_yellow', icon: 'text-brand-yellow', bg: 'bg-yellow-500/10' },
  critical: { border: 'border-l-brand-red',   glow: 'shadow-glow_red',   icon: 'text-brand-red',   bg: 'bg-red-500/10' },
};

const TREND_ICONS = { up: TrendingUp, down: TrendingDown, stable: Minus };
const TREND_COLORS = { up: 'text-brand-green', down: 'text-brand-red', stable: 'text-text-muted' };

export default function MetricCard({ title, value, unit, icon: Icon, trend, trendValue, status = 'normal' }: MetricCardProps) {
  const s = STATUS_STYLES[status];
  const TrendIcon = trend ? TREND_ICONS[trend] : null;

  return (
    <div className={cn(
      'glass rounded-xl p-4 border-l-4 transition-all duration-300 hover:-translate-y-0.5',
      s.border, s.glow
    )}>
      <div className="flex items-start justify-between mb-3">
        <p className="text-xs font-medium text-text-secondary uppercase tracking-wider">{title}</p>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', s.bg)}>
          <Icon size={16} className={s.icon} />
        </div>
      </div>
      <p className="text-2xl font-bold text-text-primary leading-none">
        {value}
        {unit && <span className="text-sm font-normal text-text-secondary ml-1">{unit}</span>}
      </p>
      {TrendIcon && trendValue && (
        <div className={cn('flex items-center gap-1 mt-2 text-xs', TREND_COLORS[trend!])}>
          <TrendIcon size={12} />
          <span>{trendValue}</span>
        </div>
      )}
    </div>
  );
}
