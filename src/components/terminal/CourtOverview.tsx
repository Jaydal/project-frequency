'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface CourtOverviewData {
  id: string;
  name: string;
  status: string;
  remaining?: string;
  queueCount: number;
}

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  Available: { bg: 'bg-green-100', text: 'text-green-700' },
  Playing: { bg: 'bg-blue-100', text: 'text-blue-700' },
  Reserved: { bg: 'bg-orange-100', text: 'text-orange-700' },
  Maintenance: { bg: 'bg-red-100', text: 'text-red-700' },
  Closed: { bg: 'bg-gray-100', text: 'text-gray-500' },
};

const STATUS_LABEL: Record<string, string> = {
  Available: 'Available',
  Playing: 'Playing',
  Reserved: 'Reserved',
  Maintenance: 'Maintenance',
  Closed: 'Closed',
};

export function CourtOverview() {
  const [courts, setCourts] = useState<CourtOverviewData[]>([]);
  const supabase = createClient();

  useEffect(() => {
    fetchOverview();
    const channel = supabase.channel('court-overview');
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'games' },
      () => fetchOverview()
    );
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries' },
      () => fetchOverview()
    );
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchOverview() {
    const { data: allCourts } = await supabase
      .from('courts')
      .select('*')
      .order('name');

    const { data: games } = await supabase
      .from('games')
      .select('court_id, duration, start_time')
      .in('status', ['In Progress', 'Scheduled']);

    const { data: queue } = await supabase
      .from('queue_entries')
      .select('court_id')
      .eq('status', 'waiting');

    if (!allCourts) return;

    const busyMap = new Map<string, { duration: number; start_time: string }>();
    (games ?? []).forEach((g: any) => {
      busyMap.set(g.court_id, g);
    });

    const queueCounts = new Map<string, number>();
    (queue ?? []).forEach((q: any) => {
      const courtId = q.court_id ?? '__none';
      queueCounts.set(courtId, (queueCounts.get(courtId) ?? 0) + 1);
    });

    const totalWaiting = queue?.length ?? 0;
    const perCourt = Math.max(1, Math.ceil(totalWaiting / (allCourts.length || 1)));

    setCourts(allCourts.map((c: any) => {
      const game = busyMap.get(c.id);
      let status = c.status === 'Available' ? 'Available' : c.status;
      let remaining: string | undefined;
      if (game) {
        status = 'Playing';
        const elapsed = Math.floor((Date.now() - new Date(game.start_time).getTime()) / 1000);
        const left = Math.max(0, game.duration * 60 - elapsed);
        remaining = `${Math.ceil(left / 60)} min`;
      }
      return {
        id: c.id,
        name: c.name,
        status,
        remaining,
        queueCount: queueCounts.get(c.id) ?? 0,
      };
    }));
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2 bg-gray-50">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Court Overview</h3>
      {courts.map(c => {
        const badge = STATUS_BADGE[c.status] ?? STATUS_BADGE.Closed;
        const label = STATUS_LABEL[c.status] ?? c.status;
        return (
          <div key={c.id} className="bg-white rounded-xl p-3 text-sm">
            <div className="font-bold text-gray-800 text-base">{c.name}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                {label}
              </span>
            </div>
            {c.remaining && (
              <div className="text-xs text-gray-500 mt-1">{c.remaining} remaining</div>
            )}
            {c.queueCount > 0 && (
              <div className="text-xs text-orange-600 font-medium mt-1">Queue: {c.queueCount}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
