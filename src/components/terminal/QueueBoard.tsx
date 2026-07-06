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
};

const supabase = createClient();

function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * 60;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}

export function QueueBoard() {
  const [courts, setCourts] = useState<CourtStatusData[]>([]);
  const [offers, setOffers] = useState<QueueEntry[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, { first: string; last: string }>>({});
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const fetchInitial = useCallback(async () => {
    const { data: games } = await supabase
      .from('games')
      .select('id, court_id, match_type, duration, status, start_time, courts!inner(name), game_players(member_id, members!inner(first_name, last_name))')
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

      setCourts(allCourts.map((c: any) => {
        const game = statusMap.get(c.id);
        if (game) {
          const elapsed = game.start_time
            ? Math.floor((now - new Date(game.start_time).getTime()) / 1000)
            : 0;
          return {
            id: c.id,
            name: c.name,
            status: game.status,
            matchType: game.match_type,
            duration: game.duration,
            elapsed,
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
  }, [now]);

  useEffect(() => {
    fetchInitial();
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

    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

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

  const queueDisplay: QueueEntryDisplay[] = queueEntries.map((q, i) => ({
    id: q.id,
    position: i + 1,
    firstName: memberNames[q.member_id]?.first ?? '?',
    lastName: memberNames[q.member_id]?.last ?? '',
    partySize: q.party_size,
    duration: q.duration,
    estimatedWait: getEstimatedWait(i + 1),
  }));

  return (
    <div className="min-h-screen bg-gray-100 p-3">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => {}}
            className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-xl px-10 py-4 rounded-full shadow-sm cursor-pointer touch-manipulation select-none"
          >
            BOOK NOW
          </button>
          <h1 className="text-xl font-bold text-gray-600">Pickleball Courts</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-3">
            {courts.map((c) => (
              <CourtStatusCard key={c.id} court={c} />
            ))}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <NowServingCard
              playerNames={offerPlayerNames}
              courtName={offerCourtName}
              duration={prioritizedOffer?.duration ?? 0}
              expiresAt={prioritizedOffer?.expires_at ?? null}
            />

            <div className="bg-white rounded-2xl shadow-sm p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
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
