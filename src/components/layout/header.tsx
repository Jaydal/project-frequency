'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { User } from '@supabase/supabase-js';

export function Header() {
  const [user, setUser] = useState<User | null>(null);
  const [mqttConnected, setMqttConnected] = useState(false);

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
    <header className="bg-zinc-900/60 backdrop-blur-md border-b border-zinc-800/50 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className={`size-2 rounded-full ${mqttConnected ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.5)]' : 'bg-red-500'}`} />
        <span className="text-[11px] text-zinc-500 font-medium">
          MQTT {mqttConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="flex items-center gap-4">
        {user ? (
          <>
            <span className="text-sm text-zinc-400">{user.email}</span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}
              className="text-zinc-500 hover:text-zinc-300"
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
