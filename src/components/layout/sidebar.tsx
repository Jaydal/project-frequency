'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSidebar } from './sidebar-context';
import { X } from 'lucide-react';
import {
  LayoutDashboard, Activity, Monitor, Users, CreditCard,
  Wallet, Settings, HeartPulse, BookOpen,
} from 'lucide-react';

const groups = [
  {
    label: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/courts', label: 'Court Monitor', icon: Activity },
      { href: '/virtual-displays', label: 'Display Monitor', icon: Monitor },
    ],
  },
  {
    label: 'People',
    items: [
      { href: '/members', label: 'Members', icon: Users },
      { href: '/rfid', label: 'RFID Cards', icon: CreditCard },
    ],
  },
  {
    label: 'Finance',
    items: [
      { href: '/wallet', label: 'Wallet & Payments', icon: Wallet },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/settings', label: 'Settings', icon: Settings },
      { href: '/health', label: 'Health', icon: HeartPulse },
      { href: '/api/docs', label: 'API Docs', icon: BookOpen, external: true },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { open, setOpen } = useSidebar();

  const content = (
    <div className="flex flex-col h-full bg-zinc-950/95 border-r border-zinc-900">
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-900/50">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="size-7 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center">
            <span className="text-emerald-400 font-black text-sm">F</span>
          </div>
          <div>
            <h1 className="text-base font-black text-zinc-100 tracking-tight leading-none">FREQ</h1>
            <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-widest mt-0.5 block">ADMIN PORTAL</span>
          </div>
        </Link>
        <button onClick={() => setOpen(false)} className="lg:hidden text-zinc-400 hover:text-zinc-200 cursor-pointer">
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6 scrollbar-thin">
        {groups.map(group => (
          <div key={group.label} className="space-y-1.5">
            <p className="text-[9px] font-black text-zinc-500 uppercase tracking-widest px-3">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map(item => {
                const isActive = pathname === item.href || (
                  item.href !== '/' && pathname.startsWith(item.href)
                );
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    target={item.external ? '_blank' : undefined}
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold uppercase tracking-wider transition-all duration-200 group ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/15 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent'
                    }`}
                  >
                    <Icon size={14} className={`shrink-0 transition-transform duration-200 ${
                      isActive ? 'text-emerald-400' : 'text-zinc-500 group-hover:text-zinc-300'
                    }`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <>
      {/* Desktop view */}
      <aside className="hidden lg:block w-56 h-screen shrink-0 sticky top-0 overflow-hidden">
        {content}
      </aside>

      {/* Mobile drawer view */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/85 backdrop-blur-sm transition-opacity duration-300" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-60 z-10 animate-slide-right overflow-hidden">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
