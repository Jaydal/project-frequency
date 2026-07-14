'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CourtStatusCard, type CourtStatusData } from './CourtStatusCard';
import { NowServingCard } from './NowServingCard';
import { QueueList, type QueueEntryDisplay } from './QueueList';

type OngoingGame = {
  id: string;
  court_id: string;
  match_type: string;
  match_title: string | null;
  duration: number;
  status: string;
  start_time: string | null;
  courts: { name: string } | null;
  game_players: Array<{
    member_id: string;
    members: { first_name: string; last_name: string } | null;
  }>;
};

type QueueEntry = {
  id: string;
  member_id: string;
  court_id: string | null;
  requested_start: string;
  duration: number;
  party_size: number;
  status: string;
  expires_at: string | null;
  created_at: string;
  match_title: string | null;
};

function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * 60;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}

type CourtWithStart = CourtStatusData & { start_time?: string };

export function QueueBoard() {
  const [courts, setCourts] = useState<CourtWithStart[]>([]);
  const [offers, setOffers] = useState<QueueEntry[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, { first: string; last: string }>>({});
  const [tick, setTick] = useState(0);
  const [prepTimeSec, setPrepTimeSec] = useState(300);
  const supabase = createClient();

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchInitial();
    const id = setInterval(async () => {
      await fetchInitial();
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const fetchInitial = useCallback(async () => {
    const { data: settings } = await supabase.from('settings').select('key, value').eq('key', 'preparationTime').single();
    if (settings) {
      const v = parseInt(settings.value, 10);
      if (!isNaN(v)) setPrepTimeSec(v);
    }

    const { data: games } = await supabase
      .from('games')
      .select('id, court_id, match_type, match_title, duration, status, start_time, courts!inner(name), game_players(member_id, members!inner(first_name, last_name))')
      .in('status', ['In Progress', 'Scheduled'])
      .order('created_at', { ascending: true });

    const { data: allCourts } = await supabase
      .from('courts')
      .select('*')
      .order('name', { ascending: true });

    const { data: queue } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true });

    const { data: activeOffers } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('status', 'offered')
      .order('expires_at', { ascending: true });

    if (allCourts) {
      const statusMap = new Map<string, OngoingGame>();
      (games ?? []).forEach((g: any) => {
        statusMap.set(g.court_id, g);
      });

      const now = Date.now();
      setCourts(allCourts.map((c: any) => {
        const game = statusMap.get(c.id);
        if (game) {
          const startTime = game.start_time ?? undefined;
          const elapsed = startTime
            ? Math.floor((now - new Date(startTime).getTime()) / 1000)
            : 0;
          return {
            id: c.id,
            name: c.name,
            status: game.status,
            matchType: game.match_type,
            matchTitle: game.match_title ?? undefined,
            duration: game.duration,
            elapsed,
            prepTimeSec,
            start_time: startTime,
            players: (game.game_players ?? []).map((gp: any) => ({
              first_name: gp.members?.first_name ?? '',
              last_name: gp.members?.last_name ?? '',
            })),
          };
        }
        return { id: c.id, name: c.name, status: 'Available' };
      }));
    }

    if (activeOffers) setOffers(activeOffers);

    if (queue) {
      setQueueEntries(queue);
      const ids = [...new Set(queue.map(q => q.member_id))];
      const { data: members } = await supabase
        .from('members')
        .select('id, first_name, last_name')
        .in('id', ids);
      if (members) {
        const map: Record<string, { first: string; last: string }> = {};
        members.forEach(m => { map[m.id] = { first: m.first_name, last: m.last_name }; });
        setMemberNames(prev => ({ ...prev, ...map }));
      }
    }
  }, []);

  useEffect(() => {
    const channel = supabase.channel('queue-board');

    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'games' },
      () => fetchInitial()
    );

    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries' },
      () => fetchInitial()
    );

    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'courts' },
      () => fetchInitial()
    );

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchInitial]);

  const prioritizedOffer = offers.length > 0
    ? offers.reduce((a, b) =>
        new Date(a.expires_at ?? 0).getTime() < new Date(b.expires_at ?? 0).getTime() ? a : b
      )
    : null;

  const offerPlayerNames = prioritizedOffer
    ? (memberNames[prioritizedOffer.member_id]?.first ?? 'Player')
    : '';

  const offerCourtName = prioritizedOffer
    ? courts.find(c => c.id === prioritizedOffer.court_id)?.name ?? 'Court'
    : '';

  const now = Date.now();
  const liveCourts: CourtStatusData[] = courts.map(c => {
    if (c.start_time) {
      return { ...c, elapsed: Math.floor((now - new Date(c.start_time).getTime()) / 1000) };
    }
    return c;
  });

  const queueDisplay: QueueEntryDisplay[] = queueEntries.map((q, i) => ({
    id: q.id,
    position: i + 1,
    firstName: memberNames[q.member_id]?.first ?? '?',
    lastName: memberNames[q.member_id]?.last ?? '',
    matchType: q.party_size === 4 ? '2v2' : '1v1',
    matchTitle: q.match_title || '',
    courtName: courts.find(c => c.id === q.court_id)?.name ?? '',
    duration: q.duration,
    estimatedWait: getEstimatedWait(i + 1),
  }));

  return (
    <div className="min-h-screen bg-black p-3">
      <div className="max-w-6xl mx-auto">
        <div className="mb-4">
          <h1 className="text-base font-medium text-zinc-500">Courts</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-3 space-y-2">
            {liveCourts.map((c) => (
              <CourtStatusCard key={c.id} court={c} />
            ))}
          </div>

          <div className="lg:col-span-2 space-y-3">
            <NowServingCard
              playerNames={offerPlayerNames}
              courtName={offerCourtName}
              duration={prioritizedOffer?.duration ?? 0}
              expiresAt={prioritizedOffer?.expires_at ?? null}
            />

            <div className="bg-zinc-900 rounded-lg p-3">
              <h2 className="text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
                Queue ({queueEntries.length})
              </h2>
              <QueueList entries={queueDisplay} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
