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
    <>
      <div className="flex items-center justify-between px-5 pt-5 pb-4">
        <div>
          <h1 className="text-lg font-bold text-emerald-400 tracking-tight">Freq</h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">Management Portal</p>
        </div>
        <button onClick={() => setOpen(false)} className="lg:hidden text-muted-foreground hover:text-foreground cursor-pointer">
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4 space-y-5">
        {groups.map(group => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 mb-1.5">
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
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-emerald-500/10 text-emerald-400 font-medium'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/50'
                    }`}
                  >
                    <Icon size={16} className="shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </>
  );

  return (
    <>
      <aside className="hidden lg:flex w-56 bg-sidebar border-r border-border h-screen flex-col shrink-0">
        {content}
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 bg-sidebar border-r border-border flex flex-col z-10">
            {content}
          </aside>
        </div>
      )}
    </>
  );
}
