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
  start_time?: string;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function CourtOverviewItem({ court, prepTimeSec }: { court: CourtState; prepTimeSec: number }) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (court.status !== 'In Progress' || !court.start_time) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [court.status, court.start_time]);

  const elapsed = court.status === 'In Progress' && court.start_time
    ? Math.max(0, Math.floor((now - new Date(court.start_time).getTime()) / 1000))
    : 0;

  const effectivePrep = court.duration ? effectivePrepSec(court.duration, prepTimeSec) : prepTimeSec;
  const phase = phaseForElapsed(elapsed, effectivePrep);

  return (
    <div className={`shrink-0 w-[140px] sm:w-auto rounded px-2 py-1.5 border ${court.status === 'In Progress' ? (phase === 'preparing' ? 'bg-zinc-900 border-amber-500/20' : 'bg-zinc-900 border-emerald-500/20') : 'bg-zinc-900/50 border-zinc-800'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <span className={`size-1.5 shrink-0 rounded-full ${court.status === 'In Progress' ? (phase === 'preparing' ? 'bg-amber-400' : 'bg-emerald-400') : 'bg-zinc-600'}`} />
          <span className="text-xs font-medium text-zinc-300 truncate">{court.name}</span>
        </div>
        {court.status === 'In Progress' && (
          <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0 ml-2">{formatTime(elapsed)}</span>
        )}
      </div>
    </div>
  );
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
          start_time: game.start_time,
        };
      }
      return { id: c.id, name: c.name, status: 'Available', elapsed: 0 };
    }));
  }

  useEffect(() => {
    fetchAll();

    const es = new EventSource('/api/queue/events');
    es.onmessage = () => fetchAll();
    es.onerror = () => es.close();

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
      es.close();
      supabase.removeChannel(channel);
    };
  }, []);

  return (
    <div className="h-full flex flex-col p-3 gap-1.5 bg-zinc-950">
      <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider hidden sm:block">Courts</h2>
      <div className="flex sm:flex-col gap-2 sm:gap-1 overflow-x-auto sm:overflow-x-hidden sm:overflow-y-auto pb-1 sm:pb-0 no-scrollbar">
        {courts.map(c => (
          <CourtOverviewItem key={c.id} court={c} prepTimeSec={prepTimeSec} />
        ))}
      </div>
    </div>
  );
}
