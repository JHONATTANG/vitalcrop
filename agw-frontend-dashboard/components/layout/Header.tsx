'use client';
import { Bell, LogOut, User } from 'lucide-react';
import { useAlerts } from '@/hooks/useAlerts';
import { useUser } from '@/hooks/useUser';
import { deleteCookie } from 'cookies-next';

interface Props { title: string }

export default function Header({ title }: Props) {
  const { data: user } = useUser();
  const { data: alerts }  = useAlerts(true);
  const unread = alerts?.length ?? 0;

  const handleSignOut = () => {
    deleteCookie('jwt');
    window.location.href = '/login';
  };

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-brand-border bg-bg-secondary/80 backdrop-blur-sm">
      <h1 className="text-base font-semibold text-text-primary">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Alerts bell */}
        <a href="/alerts" className="relative p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors">
          <Bell size={18} />
          {unread > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 text-[10px] font-bold flex items-center justify-center rounded-full bg-brand-red text-white leading-none">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </a>

        {/* User menu */}
        <div className="flex items-center gap-2 pl-3 border-l border-brand-border">
          <div className="w-7 h-7 rounded-full bg-brand-blue/20 flex items-center justify-center">
            <User size={14} className="text-brand-blue" />
          </div>
          {user?.name && (
            <span className="text-sm text-text-secondary hidden sm:block">{user.name}</span>
          )}
          <button
            onClick={handleSignOut}
            className="p-1.5 rounded-lg text-text-muted hover:text-brand-red hover:bg-red-500/10 transition-colors"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </header>
  );
}
