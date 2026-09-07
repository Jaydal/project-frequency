'use client';

import { useState, useEffect, useCallback } from 'react';
import { CourtStatusCard, type CourtStatusData } from './CourtStatusCard';
import { NowServingCard } from './NowServingCard';
import { QueueList, type QueueEntryDisplay } from './QueueList';
import { fetchBoardSnapshot } from '@/app/booking/queue/actions';
import type { BoardSnapshot } from '@/lib/queue/board-snapshot';
import { buildCourtDisplays } from './queue-board-model';

export function QueueBoard({ onBookAsGuest }: { onBookAsGuest?: () => void }) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInitial = useCallback(async () => {
    try {
      const data = await fetchBoardSnapshot();
      setSnapshot(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch board snapshot', err);
      setError('Unable to load court data. Retrying...');
    }
  }, []);

  const [clockSec, setClockSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const id = setInterval(() => setClockSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchInitial();

    const poller = setInterval(fetchInitial, 5000);

    const es = new EventSource('/api/queue/events');
    let sseDebounce: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = () => {
      if (sseDebounce) clearTimeout(sseDebounce);
      sseDebounce = setTimeout(() => {
        sseDebounce = null;
        fetchInitial();
      }, 100);
    };
    es.onerror = () => {
      // EventSource handles reconnection automatically
    };

    return () => {
      clearInterval(poller);
      es.close();
      if (sseDebounce) clearTimeout(sseDebounce);
    };
  }, [fetchInitial]);

  if (!snapshot) {
    if (error) {
      return (
        <div className="booking-shell min-h-screen bg-[var(--booking-bg)] flex items-center justify-center text-[var(--booking-text)]">
          <div className="text-center">
            <p className="text-[#ff9d9d] mb-2">{error}</p>
            <button onClick={fetchInitial} className="text-[#6db1dc] underline text-sm">Retry now</button>
          </div>
        </div>
      );
    }
    return <div className="booking-shell min-h-screen bg-[var(--booking-bg)] flex items-center justify-center text-[var(--booking-text)]">Loading...</div>;
  }

  const { courts, upcomingGames, nowServing, queue } = snapshot;

  const nowSec = clockSec;
  const courtDisplays: CourtStatusData[] = courts.map((c) => {
    const next = upcomingGames.find((g) =>
      g.id === c.id && g.startTime + g.durationMin * 60 > nowSec
    );
    const queuedNext = queue.find((q) =>
      (q.courtName === c.name || q.simulatedCourtName === c.name) && q.estimatedStartTime >= nowSec
    );
    const isPlayingNow = c.startTime > 0 && c.startTime <= nowSec;
    return {
      id: c.id,
      name: c.name,
      status: isPlayingNow ? 'In Progress' : 'Available',
      matchType: c.matchType,
      matchTitle: c.matchTitle,
      duration: c.durationMin,
      elapsed: isPlayingNow ? nowSec - c.startTime : 0,
      start_time: isPlayingNow ? new Date(c.startTime * 1000).toISOString() : undefined,
      players: c.players.map((p) => ({ first_name: p.firstName, last_name: p.lastName })),
      nextMatchTitle: queuedNext?.matchTitle || next?.matchTitle,
      nextStartTime: queuedNext?.estimatedStartTime
        ? new Date(queuedNext.estimatedStartTime * 1000).toISOString()
        : next?.startTime ? new Date(next.startTime * 1000).toISOString() : undefined,
      nextPlayers: queuedNext
        ? [{ first_name: queuedNext.firstName, last_name: queuedNext.lastName }]
        : next?.players.map((p) => ({ first_name: p.firstName, last_name: p.lastName })),
    };
  });

  const scheduledDisplays = buildCourtDisplays(courts, upcomingGames, nowSec);
  scheduledDisplays.forEach((scheduled) => {
    const index = courtDisplays.findIndex((court) => court.id === scheduled.id);
    if (index >= 0 && courtDisplays[index].status === 'Available' && scheduled.status !== 'Available') {
      courtDisplays[index] = scheduled;
    }
  });

  const queueDisplay: QueueEntryDisplay[] = queue.map((q) => ({
    id: q.id,
    position: q.position,
    firstName: q.firstName,
    lastName: q.lastName,
    matchType: q.matchType,
    matchTitle: q.matchTitle,
    courtName: q.courtName,
    duration: q.durationMin,
    estimatedWait: q.estimatedWait,
    estimatedStartTime: q.estimatedStartTime * 1000,
    bookedAt: q.bookedAt * 1000,
  }));

  return (
    <div className="booking-shell relative min-h-full overflow-visible bg-[var(--booking-bg)] p-3 text-[var(--booking-text)]">
      <img
        src="/secondary-logo.svg"
        alt=""
        aria-hidden="true"
        loading="eager"
        decoding="async"
        className="pointer-events-none absolute -right-36 -bottom-24 z-0 w-[620px] max-w-none rotate-[-10deg] opacity-[0.035]"
      />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-medium text-[var(--booking-muted)]">Courts</h1>
              <p className="text-xs text-[var(--booking-subtle)]">Tap your RFID card to book as a member</p>
            </div>
            {onBookAsGuest && (
              <button
                type="button"
                onClick={onBookAsGuest}
                className="rounded-xl bg-[#32A45E] px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white shadow-md shadow-[#32A45E]/20 hover:bg-[#3bb86b] active:scale-[0.98] transition-all"
              >
                Book Now
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <div className="min-w-0 lg:col-span-3 space-y-2">
            {courtDisplays.map((c) => (
              <CourtStatusCard key={c.id} court={c} />
            ))}
          </div>

          <div className="lg:col-span-2 space-y-3">
            <NowServingCard
              playerNames={nowServing.playerFirstName || 'Player'}
              courtName={nowServing.courtName}
              duration={nowServing.durationMin}
              expiresAt={nowServing.hasOffer ? new Date(nowServing.expiresAt * 1000).toISOString() : null}
            />

            <div className="bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-lg p-3">
              <h2 className="text-xs font-medium text-[var(--booking-muted)] uppercase tracking-wider mb-2">
                Queue ({queue.length})
              </h2>
              <QueueList entries={queueDisplay} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
