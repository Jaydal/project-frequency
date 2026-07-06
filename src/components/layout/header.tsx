'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { useSidebar } from './sidebar-context';
import { useTheme } from 'next-themes';
import { Menu, Sun, Moon } from 'lucide-react';
import type { User } from '@supabase/supabase-js';

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [mqttConnected, setMqttConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { toggle: toggleSidebar } = useSidebar();
  const { theme, setTheme } = useTheme();

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/mqtt');
        const data = await res.json();
        setMqttConnected(data.connected);
      } catch { setMqttConnected(false); }
    };
    check();
    const id = setInterval(check, 10_000);
    return () => clearInterval(id);
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  return (
    <header className="bg-background/60 backdrop-blur-md border-b border-border px-4 md:px-6 py-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={toggleSidebar} className="lg:hidden text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
          <Menu size={20} />
        </button>
        <span className={`size-2 rounded-full shrink-0 ${mqttConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-red-500'}`} />
        <span className="text-[11px] text-muted-foreground font-medium hidden sm:inline">
          MQTT {mqttConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {mounted && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:text-foreground cursor-pointer p-1.5 rounded-lg hover:bg-accent/50 transition-colors"
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        )}

        {user ? (
          <>
            <span className="text-sm text-muted-foreground truncate max-w-[120px] md:max-w-none hidden md:inline">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              Logout
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => window.location.href = '/login'}>
            Login
          </Button>
        )}
      </div>
    </header>
  );
}
