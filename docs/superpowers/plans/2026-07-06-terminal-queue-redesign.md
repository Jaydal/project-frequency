# Terminal Queue + Booking Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing single-purpose booking terminal with a combined public queue status board + booking kiosk at `/terminal/queue`.

**Architecture:** Single page at a new route (`/terminal/queue`). Two-column layout: left shows court status (4 cards), right shows "now serving" offer + queue list. A "BOOK NOW" button opens the booking flow in a modal overlay. All data via Supabase Realtime subscriptions — no polling. Booking form logic extracted from the existing `/terminal/page.tsx` into a reusable component.

**Tech Stack:** Next.js 16 (App Router), Supabase Realtime (browser client), Tailwind CSS, Vitest.

**File Structure:**

| File | Responsibility |
|---|---|
| `src/app/terminal/queue/page.tsx` | Route page — thin shell, renders `<QueueBoard>` with testmode detection |
| `src/components/terminal/QueueBoard.tsx` | Main orchestrator: fetches initial data, sets up Realtime subs, holds all state, renders layout + sub-components |
| `src/components/terminal/CourtStatusCard.tsx` | Single court card: name, timer, progress bar, players |
| `src/components/terminal/QueueList.tsx` | Ordered queue list with position badges |
| `src/components/terminal/NowServingCard.tsx` | Highlight card for active offer with countdown |
| `src/components/terminal/BookingForm.tsx` | Booking flow: scan RFID → add players → pick duration → submit. Same flow as current page, extracted as reusable |
| `src/components/terminal/BookingModal.tsx` | Modal overlay wrapping BookingForm, with backdrop dim, close button, offer detection |
| `src/app/terminal/page.tsx` | **Modified:** Replace with redirect to `/terminal/queue` |

---

### Task 1: Create route page + component directory

**Files:**
- Create: `src/app/terminal/queue/page.tsx`
- Create: directory `src/components/terminal/`

- [ ] **Step 1: Create the component directory**

```bash
mkdir -p src/components/terminal
```

- [ ] **Step 2: Write the route page**

```tsx
// src/app/terminal/queue/page.tsx
import { QueueBoard } from '@/components/terminal/QueueBoard';

export default function TerminalQueuePage() {
  return <QueueBoard />;
}
```

This is a thin server component. All logic lives in the client-side `QueueBoard` component.

- [ ] **Step 3: Create QueueBoard stub**

```tsx
// src/components/terminal/QueueBoard.tsx
'use client';

export function QueueBoard() {
  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <p className="text-center text-gray-500 py-20">Loading queue board...</p>
    </div>
  );
}
```

- [ ] **Step 4: Verify the route compiles**

Run: `npx next build 2>&1 | tail -20`
Expected: No errors. A new route `/terminal/queue` is compiled.

- [ ] **Step 5: Commit**

```bash
git add src/app/terminal/queue/page.tsx src/components/terminal/QueueBoard.tsx
git commit -m "feat: create /terminal/queue route and QueueBoard skeleton"
```

---

### Task 2: CourtStatusCard component

**Files:**
- Create: `src/components/terminal/CourtStatusCard.tsx`

- [ ] **Step 1: Write the component**

A presentational card that shows a single court's status. It receives all data as props (no internal data fetching).

```tsx
// src/components/terminal/CourtStatusCard.tsx
export interface CourtStatusData {
  id: string;
  name: string;
  status: string;
  matchType?: string;
  elapsed?: number;
  duration?: number;
  players?: Array<{ first_name: string; last_name: string }>;
}

interface Props {
  court: CourtStatusData;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CourtStatusCard({ court }: Props) {
  const isActive = court.status === 'In Progress';

  return (
    <div className={`rounded-xl p-4 border-l-8 ${
      isActive
        ? 'bg-white border-l-green-500 shadow-sm'
        : court.status === 'Scheduled'
        ? 'bg-white border-l-yellow-500 shadow-sm'
        : 'bg-gray-50 border-l-gray-300'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-bold">{court.name}</h3>
        {!isActive && court.status !== 'Scheduled' && (
          <span className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
            Available
          </span>
        )}
      </div>

      {isActive && court.elapsed !== undefined && court.duration && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-mono font-bold text-green-700">
              {formatTime(court.elapsed)}
            </span>
            <span className="text-xs text-gray-400">
              {formatTime(Math.max(0, court.duration * 60 - court.elapsed))} left
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min((court.elapsed / (court.duration * 60)) * 100, 100)}%` }}
            />
          </div>
          {court.players && court.players.length > 0 && (
            <div className="text-xs text-gray-600 space-y-0.5">
              {court.players.slice(0, 2).map((p, i) => (
                <span key={i} className="mr-2">
                  {p.first_name} {p.last_name}
                </span>
              ))}
              {court.players.length > 2 && (
                <span className="text-gray-400">+{court.players.length - 2}</span>
              )}
            </div>
          )}
        </>
      )}

      {isActive && court.matchType && (
        <div className="text-xs text-gray-400 mt-1">{court.matchType}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal/CourtStatusCard.tsx
git commit -m "feat: add CourtStatusCard component"
```

---

### Task 3: QueueList component

**Files:**
- Create: `src/components/terminal/QueueList.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/terminal/QueueList.tsx
export interface QueueEntryDisplay {
  id: string;
  position: number;
  firstName: string;
  lastName: string;
  partySize: number;
  duration: number;
  estimatedWait: string;
}

interface Props {
  entries: QueueEntryDisplay[];
}

export function QueueList({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 text-lg">No one waiting</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 overflow-y-auto max-h-[320px] pr-1">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 min-h-[48px]"
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
              e.position === 1
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {e.position}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-base">
              {e.firstName} {e.lastName.charAt(0)}.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {e.partySize === 4 ? '2v2' : '1v1'}
            </span>
            <span className="text-xs text-gray-400">{e.duration}min</span>
            <span className="text-sm font-medium text-gray-600 w-16 text-right">
              {e.estimatedWait}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal/QueueList.tsx
git commit -m "feat: add QueueList component"
```

---

### Task 4: NowServingCard component

**Files:**
- Create: `src/components/terminal/NowServingCard.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/components/terminal/NowServingCard.tsx
'use client';

import { useState, useEffect } from 'react';

interface Props {
  playerNames: string;
  courtName: string;
  duration: number;
  expiresAt: string | null;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function NowServingCard({ playerNames, courtName, duration, expiresAt }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : 0;

  const isUrgent = remaining > 0 && remaining < 60;

  if (!expiresAt || remaining <= 0) {
    return (
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200">
        <p className="text-sm text-gray-400">No active offers</p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 rounded-2xl p-5 shadow-sm border-2 border-amber-300">
      <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
        Now Serving
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{playerNames}</div>
      <div className="text-sm text-gray-600 mb-3">
        {courtName} &middot; {duration} min
      </div>
      <div className={`text-4xl font-mono font-bold mb-1 ${isUrgent ? 'text-red-600 animate-pulse' : 'text-amber-700'}`}>
        {formatCountdown(remaining)}
      </div>
      <div className="text-xs text-gray-500">remaining to confirm at terminal</div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal/NowServingCard.tsx
git commit -m "feat: add NowServingCard component"
```

---

### Task 5: QueueBoard — Realtime subscriptions and layout

**Files:**
- Modify: `src/components/terminal/QueueBoard.tsx`
- Modify: `src/app/terminal/queue/page.tsx` (add testmode detection)

- [ ] **Step 1: Rewrite QueueBoard with subscriptions and sub-components**

Replace the stub with the full implementation:

```tsx
// src/components/terminal/QueueBoard.tsx
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
  requested_start: string;
  duration: number;
  party_size: number;
  status: string;
  expires_at: string | null;
  created_at: string;
};

export function QueueBoard() {
  const [courts, setCourts] = useState<CourtStatusData[]>([]);
  const [offers, setOffers] = useState<QueueEntry[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, { first: string; last: string }>>({});
  const [now, setNow] = useState(Date.now());
  const supabase = createClient();

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
  }, []);

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
            className="bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-bold text-xl px-10 py-4 rounded-full shadow-sm cursor-pointer touch-manipulation"
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

function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * 60;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}
```

- [ ] **Step 2: Update page.tsx to pass testmode**

```tsx
// src/app/terminal/queue/page.tsx
import { QueueBoard } from '@/components/terminal/QueueBoard';

export default function TerminalQueuePage() {
  return <QueueBoard />;
}
```

- [ ] **Step 3: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/terminal/QueueBoard.tsx src/app/terminal/queue/page.tsx
git commit -m "feat: wire QueueBoard with Realtime subscriptions and layout"
```

---

### Task 6: BookingForm component

**Files:**
- Create: `src/components/terminal/BookingForm.tsx`

- [ ] **Step 1: Write the BookingForm component**

This extracts the booking flow from the existing `src/app/terminal/page.tsx` into a reusable component. The flow:
1. Scan RFID (or test mode grid) → add player
2. Add more players
3. Pick duration → submits immediately (no separate confirm step)
4. Shows result (success or queued)

```tsx
// src/components/terminal/BookingForm.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Player {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  balance: number;
}

interface BookingResult {
  status: 'completed' | 'waiting' | 'offered';
  court_name?: string;
  position?: number;
  estimatedWait?: string;
  duration?: number;
  party_size?: number;
}

type Step = 'scan' | 'players' | 'duration' | 'offer' | 'result';

const RATES: Record<string, number> = { '30': 150, '60': 300, '90': 450 };

const TEST_PLAYERS: Player[] = [
  { id: '550e8400-e29b-41d4-a716-446655440000', memberId: 'PB-TEST-001', firstName: 'Juan', lastName: 'Dela Cruz', balance: 99999 },
  { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', memberId: 'PB-TEST-002', firstName: 'Maria', lastName: 'Santos', balance: 500 },
  { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', memberId: 'PB-TEST-003', firstName: 'Jose', lastName: 'Rizal', balance: 500 },
  { id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', memberId: 'PB-TEST-004', firstName: 'Ana', lastName: 'Gonzales', balance: 500 },
  { id: '123e4567-e89b-12d3-a456-426614174000', memberId: 'PB-TEST-005', firstName: 'Pedro', lastName: 'Penduko', balance: 500 },
];

interface Props {
  testMode: boolean;
  onComplete: (result: BookingResult) => void;
  onClose: () => void;
}

export function BookingForm({ testMode, onComplete, onClose }: Props) {
  const [step, setStep] = useState<Step>('scan');
  const [players, setPlayers] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [duration, setDuration] = useState(30);
  const [offerEntry, setOfferEntry] = useState<any>(null);
  const [offerRemaining, setOfferRemaining] = useState(0);
  const rfidRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    if (step === 'scan' && !testMode) {
      setTimeout(() => rfidRef.current?.focus(), 100);
    }
  }, [step, testMode]);

  function focusRfid() {
    setTimeout(() => rfidRef.current?.focus(), 100);
  }

  async function handleRfidSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rfidRef.current) return;
    const uid = rfidRef.current.value.trim();
    rfidRef.current.value = '';
    if (!uid) return;
    await lookupAndAdd(uid);
  }

  async function lookupAndAdd(uid: string) {
    setError('');
    try {
      const { data, error: err } = await supabase
        .from('rfid_cards')
        .select('uid, member_id, members!inner(id, member_id, first_name, last_name, wallets(balance))')
        .eq('uid', uid)
        .eq('status', 'Active')
        .single();

      if (err || !data) { setError('Invalid RFID'); focusRfid(); return; }

      const m = data.members as any;
      addPlayer({
        id: m.id,
        memberId: m.member_id,
        firstName: m.first_name,
        lastName: m.last_name,
        balance: Array.isArray(m.wallets) ? (m.wallets[0]?.balance ?? 0) : (m.wallets?.balance ?? 0),
      });
    } catch { setError('Connection error'); focusRfid(); }
  }

  function addPlayer(player: Player) {
    if (players.find(p => p.memberId === player.memberId)) {
      setError('Already added'); focusRfid();
      return;
    }
    setPlayers(prev => [...prev, player]);
    setError('');
    if (step === 'scan') setStep('players');
    checkPendingOffer(player.id);
  }

  async function checkPendingOffer(memberId: string) {
    const { data } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('member_id', memberId)
      .eq('status', 'offered')
      .single();
    if (data) {
      setOfferEntry(data);
      setOfferRemaining(Math.max(0, Math.floor((new Date(data.expires_at).getTime() - Date.now()) / 1000)));
      setStep('offer');
    }
  }

  function handleSelectTestPlayer(player: Player) {
    if (players.find(p => p.memberId === player.memberId)) return;
    setPlayers(prev => [...prev, player]);
    if (step === 'scan') setStep('players');
    checkPendingOffer(player.id);
  }

  function removePlayer(memberId: string) {
    setPlayers(prev => prev.filter(p => p.memberId !== memberId));
  }

  async function handleDurationSelect(d: number) {
    if (players.length === 0) return;
    setDuration(d);
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: players[0].id,
          start: new Date().toISOString(),
          duration: d,
          partySize: players.length >= 4 ? 4 : 2,
          playerIds: players.map(p => p.id),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'Request failed');
        setBusy(false);
        return;
      }

      const entry = await res.json();
      if (entry.status === 'completed') {
        onComplete({
          status: 'completed',
          court_name: entry.court_name,
          duration: d,
          party_size: players.length >= 4 ? 4 : 2,
        });
      } else if (entry.status === 'offered') {
        setOfferEntry(entry);
        setOfferRemaining(Math.max(0, Math.floor((new Date(entry.expires_at).getTime() - Date.now()) / 1000)));
        setStep('offer');
      } else {
        onComplete({
          status: 'waiting',
          position: entry.position,
          estimatedWait: entry.estimatedWait,
          duration: d,
          party_size: players.length >= 4 ? 4 : 2,
        });
      }
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  async function handleAcceptOffer() {
    if (!offerEntry) return;
    setBusy(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: offerEntry.id, action: 'accept' }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'Accept failed');
        setBusy(false);
        return;
      }
      const data = await res.json();
      onComplete({
        status: 'completed',
        court_name: data.courtName,
        duration: offerEntry.duration,
        party_size: offerEntry.party_size,
      });
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  async function handleDeclineOffer() {
    if (!offerEntry) return;
    setBusy(true);
    try {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: offerEntry.id, action: 'decline' }),
      });
      onClose();
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  useEffect(() => {
    if (step !== 'offer' || !offerEntry?.expires_at) return;
    const id = setInterval(() => {
      const rem = Math.max(0, Math.floor((new Date(offerEntry.expires_at).getTime() - Date.now()) / 1000));
      setOfferRemaining(rem);
      if (rem <= 0) {
        setError('Offer expired');
        setStep('scan');
        setPlayers([]);
      }
    }, 1000);
    return () => clearInterval(id);
  }, [step, offerEntry]);

  const partySize = players.length >= 4 ? 4 : (players.length >= 2 ? 2 : 2);
  const chargePerPlayer = (RATES[String(duration)] * (duration / 30)) / (partySize === 4 ? 2 : 1);

  return (
    <div className="space-y-4">
      {step === 'scan' && (
        <>
          <h2 className="text-2xl font-bold text-center">TAP RFID CARD</h2>
          <p className="text-gray-500 text-center">Scan card to start booking</p>
          {error && <p className="text-red-600 text-center text-sm">{error}</p>}
          {testMode ? (
            <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
              {TEST_PLAYERS.map(p => (
                <button
                  key={p.memberId}
                  onClick={() => handleSelectTestPlayer(p)}
                  className="bg-white border-2 border-gray-200 rounded-xl p-5 text-center active:border-blue-500 cursor-pointer"
                >
                  <div className="text-lg font-bold">{p.firstName}</div>
                  <div className="text-xs text-gray-500">{p.lastName}</div>
                  <div className="text-sm font-semibold mt-1 text-green-700">₱{p.balance.toLocaleString()}</div>
                </button>
              ))}
            </div>
          ) : (
            <form onSubmit={handleRfidSubmit} className="text-center">
              <input
                ref={rfidRef} type="text" autoFocus
                className="w-64 h-12 text-center text-lg border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 bg-white"
                placeholder="Scan card here..."
              />
              <button type="submit" hidden />
            </form>
          )}
        </>
      )}

      {step === 'players' && (
        <>
          <h2 className="text-2xl font-bold text-center">PLAYERS</h2>
          <div className="space-y-2 max-w-sm mx-auto">
            {players.map(p => (
              <div key={p.memberId} className="bg-white border rounded-xl p-4 flex items-center justify-between">
                <div>
                  <span className="font-semibold">{p.firstName} {p.lastName}</span>
                  <span className="ml-3 text-sm text-green-700">₱{p.balance.toLocaleString()}</span>
                </div>
                <button onClick={() => removePlayer(p.memberId)} className="text-red-500 text-sm px-2 cursor-pointer">
                  Remove
                </button>
              </div>
            ))}
          </div>
          {error && <p className="text-red-600 text-center text-sm">{error}</p>}
          <div className="flex flex-col items-center gap-3">
            <button
              onClick={() => { setStep('scan'); focusRfid(); }}
              className="px-8 py-3 bg-gray-100 rounded-xl text-lg font-medium active:bg-gray-200 cursor-pointer"
            >
              Add Player ({players.length}/{partySize})
            </button>
            <button
              onClick={() => setStep('duration')}
              disabled={players.length < 1}
              className="px-10 py-4 bg-blue-600 text-white rounded-2xl text-xl font-bold disabled:opacity-40 active:bg-blue-700 cursor-pointer disabled:cursor-default"
            >
              Next
            </button>
          </div>
        </>
      )}

      {step === 'duration' && (
        <>
          <h2 className="text-2xl font-bold text-center">DURATION</h2>
          <p className="text-center text-gray-500 text-sm mb-4">
            {partySize === 4 ? '2v2' : '1v1'} &middot; {players.length} player{players.length > 1 ? 's' : ''}
          </p>
          {error && <p className="text-red-600 text-center text-sm">{error}</p>}
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
            {[30, 60, 90].map(d => {
              const total = RATES[String(d)] * (d / 30);
              const perPlayer = partySize === 4 ? total / 2 : total;
              return (
                <button
                  key={d}
                  onClick={() => handleDurationSelect(d)}
                  disabled={busy}
                  className="bg-white border-2 border-gray-200 rounded-xl p-6 text-center active:border-blue-500 cursor-pointer disabled:opacity-40"
                >
                  <div className="text-2xl font-bold">{d}</div>
                  <div className="text-xs text-gray-500">min</div>
                  <div className="text-sm font-semibold mt-1 text-blue-700">₱{perPlayer}</div>
                </button>
              );
            })}
          </div>
          <button onClick={() => setStep('players')} className="block mx-auto mt-4 text-gray-500 underline text-sm cursor-pointer">
            Back
          </button>
        </>
      )}

      {step === 'offer' && offerEntry && (
        <>
          <h2 className="text-2xl font-bold text-center">COURT AVAILABLE!</h2>
          <p className="text-center text-gray-600">{offerEntry.duration} min</p>
          <div className="text-center mb-4">
            <div className={`text-5xl font-mono font-bold ${offerRemaining < 60 ? 'text-red-600 animate-pulse' : 'text-amber-600'}`}>
              {Math.floor(offerRemaining / 60)}:{String(offerRemaining % 60).padStart(2, '0')}
            </div>
            <p className="text-sm text-gray-500">remaining to confirm</p>
          </div>
          {error && <p className="text-red-600 text-center text-sm">{error}</p>}
          {offerRemaining <= 0 ? (
            <p className="text-center text-red-600 font-semibold">Offer expired</p>
          ) : (
            <div className="flex gap-4 justify-center">
              <button onClick={handleDeclineOffer} disabled={busy}
                className="px-8 py-3 bg-gray-100 rounded-xl text-lg cursor-pointer disabled:opacity-40"
              >Decline</button>
              <button onClick={handleAcceptOffer} disabled={busy}
                className="px-10 py-3 bg-green-600 text-white rounded-xl text-lg font-bold disabled:opacity-40 active:bg-green-700 cursor-pointer disabled:cursor-default"
              >{busy ? 'Accepting...' : 'Accept & Book'}</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal/BookingForm.tsx
git commit -m "feat: add BookingForm component extracted from existing terminal page"
```

---

### Task 7: BookingModal component

**Files:**
- Create: `src/components/terminal/BookingModal.tsx`

- [ ] **Step 1: Write the BookingModal**

```tsx
// src/components/terminal/BookingModal.tsx
'use client';

import { useState } from 'react';
import { BookingForm } from './BookingForm';

interface BookingResult {
  status: 'completed' | 'waiting' | 'offered';
  court_name?: string;
  position?: number;
  estimatedWait?: string;
  duration?: number;
  party_size?: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  testMode: boolean;
}

export function BookingModal({ isOpen, onClose, testMode }: Props) {
  const [result, setResult] = useState<BookingResult | null>(null);

  if (!isOpen) return null;

  function handleComplete(res: BookingResult) {
    setResult(res);
  }

  function handleClose() {
    setResult(null);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center text-gray-400 hover:text-gray-600 text-2xl cursor-pointer"
        >
          &times;
        </button>

        {result ? (
          <div className="text-center py-8 space-y-4">
            {result.status === 'completed' ? (
              <>
                <div className="text-6xl">✅</div>
                <h2 className="text-2xl font-bold">BOOKING CONFIRMED!</h2>
                <p className="text-lg text-gray-700">{result.court_name}</p>
                <p className="text-sm text-gray-500">
                  {result.duration} min &middot; {result.party_size === 4 ? '2v2' : '1v1'}
                </p>
              </>
            ) : (
              <>
                <div className="text-6xl">⏳</div>
                <h2 className="text-2xl font-bold">IN QUEUE</h2>
                <p className="text-5xl font-bold text-yellow-600">{result.position ?? '?'}</p>
                <p className="text-gray-500">in line</p>
                <p className="text-sm text-gray-500">Est. wait: {result.estimatedWait ?? '~60 min'}</p>
              </>
            )}
            <button
              onClick={handleClose}
              className="mt-6 px-10 py-4 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700 cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <BookingForm testMode={testMode} onComplete={handleComplete} onClose={handleClose} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal/BookingModal.tsx
git commit -m "feat: add BookingModal overlay component"
```

---

### Task 8: Wire BookingModal into QueueBoard

**Files:**
- Modify: `src/components/terminal/QueueBoard.tsx`

- [ ] **Step 1: Add modal state and BOOK NOW handler**

Replace the QueueBoard to integrate the modal. Add testmode detection and modal open/close state:

```tsx
// src/components/terminal/QueueBoard.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CourtStatusCard, type CourtStatusData } from './CourtStatusCard';
import { NowServingCard } from './NowServingCard';
import { QueueList, type QueueEntryDisplay } from './QueueList';
import { BookingModal } from './BookingModal';

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
  requested_start: string;
  duration: number;
  party_size: number;
  status: string;
  expires_at: string | null;
  created_at: string;
};

export function QueueBoard() {
  const [courts, setCourts] = useState<CourtStatusData[]>([]);
  const [offers, setOffers] = useState<QueueEntry[]>([]);
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, { first: string; last: string }>>({});
  const [now, setNow] = useState(Date.now());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const supabase = createClient();

  useEffect(() => {
    setTestMode(new URLSearchParams(window.location.search).get('testmode') === 'true');
  }, []);

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
  }, []);

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
            onClick={() => setBookingOpen(true)}
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

      <BookingModal
        isOpen={bookingOpen}
        onClose={() => setBookingOpen(false)}
        testMode={testMode}
      />
    </div>
  );
}

function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * 60;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -20`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/terminal/QueueBoard.tsx
git commit -m "feat: wire BookingModal into QueueBoard with BOOK NOW button"
```

---

### Task 9: Update old /terminal route to redirect

**Files:**
- Modify: `src/app/terminal/page.tsx`

- [ ] **Step 1: Replace the old page with a redirect**

```tsx
// src/app/terminal/page.tsx
import { redirect } from 'next/navigation';

export default function TerminalPage() {
  redirect('/terminal/queue');
}
```

- [ ] **Step 2: Verify build**

Run: `npx next build 2>&1 | tail -10`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/terminal/page.tsx
git commit -m "refactor: redirect old /terminal to /terminal/queue"
```

---

### Task 10: Build and test verification

- [ ] **Step 1: Full build check**

Run: `npx next build 2>&1 | tail -20`
Expected: `✓ Compiled successfully` with no errors.

- [ ] **Step 2: Run existing queue tests to ensure nothing broke**

```bash
npx vitest run src/lib/queue/ 2>&1 | tail -15
```

Expected: All queue service tests pass (they test the backend, which is unchanged).

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run 2>&1 | tail -25
```

Expected: Queue tests pass. Any pre-existing failures (e.g. `esp32.test.ts` referencing Prisma) are unchanged.

- [ ] **Step 4: Start dev server for manual verification**

```bash
npm run dev
```

Open `http://localhost:3000/terminal/queue?testmode=true` and verify:
1. Queue board loads with court status cards
2. Queue list shows waiting entries (or "No one waiting")
3. "BOOK NOW" button opens modal
4. Booking flow works end-to-end
5. Old `/terminal` redirects to `/terminal/queue`

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat: complete terminal queue redesign with booking modal"
```
