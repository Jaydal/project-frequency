'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { phaseForElapsed } from './CourtStatusCard';
import { effectivePrepSec } from '@/lib/products-config-types';

interface CourtState {
  id: string;
  name: string;
  status: string;
  elapsed: number;
  duration?: number;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CourtOverview() {
  const [courts, setCourts] = useState<CourtState[]>([]);
  const [prepTimeSec, setPrepTimeSec] = useState(300);
  const supabase = createClient();

  async function fetchAll() {
    const { data: settings } = await supabase.from('settings').select('key, value').eq('key', 'preparationTime').single();
    if (settings) {
      const v = parseInt(settings.value, 10);
      if (!isNaN(v)) setPrepTimeSec(v);
    }

    const { data: courtsData } = await supabase
      .from('courts')
      .select('*')
      .order('name', { ascending: true });
    if (!courtsData) return;

    const { data: games } = await supabase
      .from('games')
      .select('court_id, status, start_time, duration')
      .in('status', ['In Progress', 'Scheduled']);

    const now = Date.now();
    setCourts(courtsData.map((c: any) => {
      const game = (games ?? []).find((g: any) => g.court_id === c.id);
      if (game && game.start_time) {
        return {
          id: c.id,
          name: c.name,
          status: game.status === 'In Progress' ? 'In Progress' : 'Scheduled',
          elapsed: game.status === 'In Progress'
            ? Math.floor((now - new Date(game.start_time).getTime()) / 1000)
            : 0,
          duration: game.duration,
        };
      }
      return { id: c.id, name: c.name, status: 'Available', elapsed: 0 };
    }));
  }

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    const channel = supabase.channel('court-overview');
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'games' },
      () => fetchAll()
    );
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'courts' },
      () => fetchAll()
    );
    channel.subscribe();
    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="h-full flex flex-col p-3 gap-1.5">
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Courts</h2>
      <div className="flex-1 space-y-1 overflow-y-auto">
        {courts.map(c => {
          const effectivePrep = c.duration ? effectivePrepSec(c.duration, prepTimeSec) : prepTimeSec;
          const phase = phaseForElapsed(c.elapsed, effectivePrep);
          return (
            <div key={c.id} className={`rounded px-2 py-1.5 border ${c.status === 'In Progress' ? (phase === 'preparing' ? 'bg-zinc-900 border-amber-500/20' : 'bg-zinc-900 border-emerald-500/20') : 'bg-zinc-900/50 border-zinc-800'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`size-1.5 rounded-full ${c.status === 'In Progress' ? (phase === 'preparing' ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-zinc-600'}`} />
                  <span className="text-xs font-medium text-zinc-300">{c.name}</span>
                </div>
                {c.status === 'In Progress' && (
                  <span className="text-xs font-mono text-zinc-400 tabular-nums">{formatTime(c.elapsed)}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
