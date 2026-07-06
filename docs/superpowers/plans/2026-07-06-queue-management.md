# Queue Management System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-ready FCFS waiting queue system that automatically assigns courts when none are immediately available.

**Architecture:** Single `queue_entries` table in Supabase. Four focused services in `src/lib/queue/`. Terminal uses Supabase Realtime for live updates. IoT displays use existing MQTT. Reuses existing `register_game` RPC for atomic booking.

**Tech Stack:** Next.js 16, Supabase (Postgres + Realtime), MQTT (HiveMQ), Vitest.

---

### Task 1: Add queue_entries table to schema

**Files:**
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Append the queue_entries table**

Add this before the seed data section:

```sql
CREATE TABLE IF NOT EXISTS queue_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id       UUID NOT NULL REFERENCES members(id),
  requested_start TIMESTAMPTZ NOT NULL,
  duration        INTEGER NOT NULL CHECK (duration IN (30, 60, 90)),
  party_size      INTEGER NOT NULL CHECK (party_size IN (2, 4)),
  player_ids      JSONB NOT NULL DEFAULT '[]',
  court_id        UUID REFERENCES courts(id),
  status          TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN (
                      'waiting', 'offered', 'accepted',
                      'declined', 'expired', 'cancelled',
                      'completed', 'insufficient_credits'
                    )),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_entries_member_waiting
  ON queue_entries (member_id) WHERE status = 'waiting';
```

- [ ] **Step 2: Apply to Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/schema.sql
git commit -m "feat: add queue_entries table for queue management"
```

---

### Task 2: Shared types and barrel export

**Files:**
- Create: `src/lib/queue/index.ts`

- [ ] **Step 1: Write the file**

```ts
export type QueueStatus =
  | 'waiting' | 'offered' | 'accepted'
  | 'declined' | 'expired' | 'cancelled'
  | 'completed' | 'insufficient_credits';

export interface CourtInfo {
  id: string;
  name: string;
  status: string;
}

export interface QueueEntry {
  id: string;
  member_id: string;
  requested_start: string;
  duration: number;
  party_size: number;
  player_ids: string[];
  court_id: string | null;
  status: QueueStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export const QUEUE_DEFAULT_TIMEOUT_MIN = 5;
export const AVG_GAME_DURATION_MIN = 60;

export function isOverlapping(
  requestedStart: Date, requestedEnd: Date,
  existingStart: Date, existingEnd: Date
): boolean {
  return requestedStart < existingEnd && requestedEnd > existingStart;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/queue/index.ts
git commit -m "feat: add queue shared types and isOverlapping utility"
```

---

### Task 3: Booking engine

**Files:**
- Create: `src/lib/queue/booking-engine.ts`
- Create: `src/lib/queue/booking-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/queue/booking-engine.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { findAvailableCourt, isSlotAvailable } from './booking-engine'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    lte: vi.fn(() => chain),
  }
  return { from: vi.fn(() => chain), rpc: vi.fn() }
}

describe('findAvailableCourt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a court when no overlapping games exist', async () => {
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), in: vi.fn(), gte: vi.fn(), lt: vi.fn(), lte: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.gte = vi.fn(() => c)
      c.lt = vi.fn(async () => ({ data: [], error: null }))
      c.lte = vi.fn(() => c)
      c.order = vi.fn(() => c)
      if (t === 'courts') c.single = vi.fn(async () => ({ data: [{ id: 'c1', name: 'Court 1', status: 'Available' }], error: null }))
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await findAvailableCourt(new Date('2026-07-07T10:00:00Z'), 60, 2)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('c1')
  })

  it('returns null when all courts have overlapping games', async () => {
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), in: vi.fn(), gte: vi.fn(), lt: vi.fn(), lte: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.gte = vi.fn(() => c)
      c.lt = vi.fn(async () => ({ data: [{ id: 'g1' }], error: null }))
      c.lte = vi.fn(() => c)
      c.order = vi.fn(() => c)
      c.single = vi.fn(async () => ({ data: null, error: null }))
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await findAvailableCourt(new Date('2026-07-07T10:00:00Z'), 60, 2)
    expect(result).toBeNull()
  })
})

describe('isSlotAvailable', () => {
  it('returns true when no games overlap', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            gte: vi.fn(async () => ({ data: [], error: null })),
            lt: vi.fn(),
            lte: vi.fn(),
          })),
        })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await isSlotAvailable('c1', new Date('2026-07-07T10:00:00Z'), new Date('2026-07-07T11:00:00Z'))
    expect(result).toBe(true)
  })

  it('returns false when a game overlaps', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            gte: vi.fn(async () => ({ data: [{ id: 'g1' }], error: null })),
            lt: vi.fn(),
            lte: vi.fn(),
          })),
        })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await isSlotAvailable('c1', new Date('2026-07-07T10:00:00Z'), new Date('2026-07-07T11:00:00Z'))
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/queue/booking-engine.test.ts 2>&1 | tail -15`

Expected: FAIL — `findAvailableCourt` and `isSlotAvailable` not defined.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/queue/booking-engine.ts
import { createClient } from '@/lib/supabase/server';
import { isOverlapping, type CourtInfo } from './index';

export async function findAvailableCourt(
  requestedStart: Date,
  duration: number,
  partySize: number,
  excludeCourtId?: string
): Promise<CourtInfo | null> {
  const supabase = await createClient();
  const end = new Date(requestedStart.getTime() + duration * 60_000);

  const { data: courts } = await supabase
    .from('courts')
    .select('*')
    .eq('status', 'Available')
    .order('name', { ascending: true });

  if (!courts) return null;

  for (const court of courts) {
    if (excludeCourtId && court.id === excludeCourtId) continue;
    const slotFree = await isSlotAvailable(court.id, requestedStart, end);
    if (slotFree) return { id: court.id, name: court.name, status: court.status };
  }

  return null;
}

export async function isSlotAvailable(
  courtId: string,
  start: Date,
  end: Date
): Promise<boolean> {
  const supabase = await createClient();

  const { data: overlapping } = await supabase
    .from('games')
    .select('id')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .gte('start_time', start.toISOString())
    .lt('start_time', end.toISOString());

  if (overlapping && overlapping.length > 0) return false;

  const { data: straddling } = await supabase
    .from('games')
    .select('id, duration, start_time')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .lt('start_time', start.toISOString());

  if (!straddling) return true;

  for (const game of straddling) {
    const gameEnd = new Date(
      new Date(game.start_time).getTime() + game.duration * 60_000
    );
    if (isOverlapping(start, end, new Date(game.start_time), gameEnd)) {
      return false;
    }
  }

  return true;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/queue/booking-engine.test.ts 2>&1 | tail -15`

Expected: PASS — 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/booking-engine.ts src/lib/queue/booking-engine.test.ts
git commit -m "feat: add booking engine with court availability checking"
```

---

### Task 4: Queue service

**Files:**
- Create: `src/lib/queue/queue-service.ts`
- Create: `src/lib/queue/queue-service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/queue/queue-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ findAvailableCourt: vi.fn(), isSlotAvailable: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { findAvailableCourt } from './booking-engine'
import { joinQueue, leaveQueue, getQueuePosition, getEstimatedWait } from './queue-service'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    count: vi.fn(() => chain),
  }
  return { from: vi.fn(() => chain), rpc: vi.fn() }
}

describe('joinQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns immediate booking when a court is available', async () => {
    vi.mocked(findAvailableCourt).mockResolvedValue({ id: 'c1', name: 'Court 1', status: 'Available' })
    const db = makeDb()
    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date('2026-07-07T14:00:00Z')
    const result = await joinQueue({ memberId: 'm1', start, duration: 60, partySize: 2, playerIds: ['m1', 'm2'] })
    expect(result.status).toBe('completed')
  })

  it('inserts a waiting entry when no court is available', async () => {
    vi.mocked(findAvailableCourt).mockResolvedValue(null)
    const db = makeDb()
    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date('2026-07-07T14:00:00Z')
    const result = await joinQueue({ memberId: 'm1', start, duration: 60, partySize: 2, playerIds: ['m1', 'm2'] })
    expect(result.status).toBe('waiting')
  })

  it('rejects when member has overlapping booking', async () => {
    vi.mocked(findAvailableCourt).mockResolvedValue(null)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), insert: vi.fn(), update: vi.fn(), in: vi.fn(), lt: vi.fn(), count: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.lt = vi.fn(() => c)
      c.single = vi.fn()
      c.insert = vi.fn()
      c.update = vi.fn()
      c.count = vi.fn()
      if (t === 'game_players') {
        // Return existing booking
        c.in = vi.fn(async () => ({ data: [{ id: 'gp1' }], error: null }))
      }
      if (t === 'queue_entries') {
        c.single = vi.fn(async () => ({ data: null, error: null }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date('2026-07-07T14:00:00Z')
    await expect(joinQueue({ memberId: 'm1', start, duration: 60, partySize: 2, playerIds: ['m1', 'm2'] }))
      .rejects.toThrow('Already booked')
  })
})

describe('leaveQueue', () => {
  it('calls update with cancelled status', async () => {
    const db = makeDb()
    vi.mocked(createClient).mockResolvedValue(db as any)
    await leaveQueue('qe-1')
    expect(db.from).toHaveBeenCalledWith('queue_entries')
  })
})

describe('getQueuePosition', () => {
  it('returns count of earlier waiting entries', async () => {
    const db = makeDb()
    let callCount = 0
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => {
          callCount++
          if (callCount === 1) {
            // First call: get the entry's created_at
            return { single: vi.fn(async () => ({ data: { created_at: '2026-07-07T12:00:00Z' }, error: null })) }
          }
          // Second call: count earlier entries
          return { lt: vi.fn(async () => ({ count: 3, error: null })) }
        }),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)
    expect(await getQueuePosition('qe-1')).toBe(3)
  })
})

describe('getEstimatedWait', () => {
  it('formats human-readable time', () => {
    expect(getEstimatedWait(0)).toBe('Now')
    expect(getEstimatedWait(1)).toBe('~60 min')
    expect(getEstimatedWait(3)).toBe('~3 hours')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/queue/queue-service.test.ts 2>&1 | tail -15`

Expected: FAIL — functions not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/queue/queue-service.ts
import { createClient } from '@/lib/supabase/server';
import { findAvailableCourt } from './booking-engine';
import type { QueueEntry } from './index';
import { AVG_GAME_DURATION_MIN } from './index';

export interface JoinQueueParams {
  memberId: string;
  start: Date;
  duration: number;
  partySize: number;
  playerIds: string[];
}

export async function joinQueue(params: JoinQueueParams): Promise<QueueEntry> {
  const supabase = await createClient();

  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('id', params.memberId)
    .single();
  if (!member || member.status !== 'Active') throw new Error('Member not active');

  const { data: activeGames } = await supabase
    .from('games')
    .select('id')
    .in('status', ['Scheduled', 'In Progress']);

  if (activeGames && activeGames.length > 0) {
    const { data: myBookings } = await supabase
      .from('game_players')
      .select('id')
      .eq('member_id', params.memberId)
      .in('game_id', activeGames.map(g => g.id));

    if (myBookings && myBookings.length > 0) {
      throw new Error('Already booked for this time slot');
    }
  }

  const { data: existingQueue } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('member_id', params.memberId)
    .eq('status', 'waiting')
    .single();
  if (existingQueue) throw new Error('Already in queue');

  const court = await findAvailableCourt(params.start, params.duration, params.partySize);
  if (court) {
    const { data: game, error } = await supabase.rpc('register_game', {
      p_court_name: court.name,
      p_match_type: params.partySize === 4 ? '2v2' : '1v1',
      p_duration: params.duration,
      p_players: JSON.stringify(
        params.playerIds.map(() => ({ rfid: '', team: null, charge_amount: 0 }))
      ),
    });
    if (error) throw new Error(error.message);

    return {
      id: game as string,
      member_id: params.memberId,
      requested_start: params.start.toISOString(),
      duration: params.duration,
      party_size: params.partySize,
      player_ids: params.playerIds,
      court_id: court.id,
      status: 'completed',
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  const { data: entry, error } = await supabase
    .from('queue_entries')
    .insert({
      member_id: params.memberId,
      requested_start: params.start.toISOString(),
      duration: params.duration,
      party_size: params.partySize,
      player_ids: JSON.stringify(params.playerIds),
      status: 'waiting',
    })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return entry as QueueEntry;
}

export async function leaveQueue(entryId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('queue_entries')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', entryId);
}

export async function getQueuePosition(entryId: string): Promise<number> {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('created_at')
    .eq('id', entryId)
    .single();
  if (!entry) return 0;
  const { count } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .lt('created_at', entry.created_at);
  return count ?? 0;
}

export function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * AVG_GAME_DURATION_MIN;
  if (minutes < 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/queue/queue-service.test.ts 2>&1 | tail -15`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/queue-service.ts src/lib/queue/queue-service.test.ts
git commit -m "feat: add queue service with join, leave, position, and wait estimation"
```

---

### Task 5: Queue processor

**Files:**
- Create: `src/lib/queue/queue-processor.ts`
- Create: `src/lib/queue/queue-processor.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/queue/queue-processor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ isSlotAvailable: vi.fn(), findAvailableCourt: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable } from './booking-engine'
import { processCourt, processExpiredOffers } from './queue-processor'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
  }
  return { from: vi.fn(() => chain), rpc: vi.fn() }
}

describe('processCourt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('offers the next waiting entry compatible with the court', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), update: vi.fn(), in: vi.fn(), lt: vi.fn(), gte: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.order = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.lt = vi.fn(() => c)
      c.gte = vi.fn(() => c)
      c.single = vi.fn()
      if (t === 'queue_entries') {
        c.eq = vi.fn(() => c)
        c.order = vi.fn(async () => ({ data: [{ id: 'qe-1', member_id: 'm1', requested_start: '2026-07-07T14:00:00Z', duration: 60, party_size: 2, player_ids: ['m1', 'm2'] }], error: null }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    await processCourt('c1')
    // Should update the queue entry to offered
    expect(db.from).toHaveBeenCalledWith('queue_entries')
  })

  it('does nothing when queue is empty', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(async () => ({ data: [], error: null })),
        })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await processCourt('c1')
    // No error expected
  })
})

describe('processExpiredOffers', () => {
  it('expires offers past their deadline', async () => {
    const db = makeDb()
    const expired = [{ id: 'qe-1', court_id: 'c1' }]
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), update: vi.fn(), in: vi.fn(), lt: vi.fn(), gte: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.lt = vi.fn(async () => ({ data: expired, error: null }))
      c.update = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.gte = vi.fn(() => c)
      c.single = vi.fn()
      c.order = vi.fn(() => c)
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    await processExpiredOffers()
    // No error expected
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/queue/queue-processor.test.ts 2>&1 | tail -15`

Expected: FAIL — functions not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/queue/queue-processor.ts
import { createClient } from '@/lib/supabase/server';
import { isSlotAvailable } from './booking-engine';
import { publishDisplay } from '@/lib/mqtt';
import { QUEUE_DEFAULT_TIMEOUT_MIN } from './index';

let expiryInterval: ReturnType<typeof setInterval> | null = null;

export function startExpiryProcessor(): void {
  if (expiryInterval) return;
  expiryInterval = setInterval(processExpiredOffers, 30_000);
  processExpiredOffers();
}

export async function processExpiredOffers(): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: expired } = await supabase
    .from('queue_entries')
    .select('id, court_id')
    .eq('status', 'offered')
    .lt('expires_at', now);

  if (!expired || expired.length === 0) return;

  for (const entry of expired) {
    await supabase
      .from('queue_entries')
      .update({ status: 'expired', updated_at: now })
      .eq('id', entry.id);

    if (entry.court_id) {
      await processCourt(entry.court_id);
    }
  }
}

export async function processCourt(courtId: string): Promise<void> {
  const supabase = await createClient();

  const { data: waiting } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (!waiting || waiting.length === 0) {
    await publishDisplay(courtId, {
      line1: 'COURT AVAILABLE',
      line2: '',
      line3: 'READY FOR NEXT GAME',
    });
    return;
  }

  for (const entry of waiting) {
    const start = new Date(entry.requested_start);
    const end = new Date(start.getTime() + entry.duration * 60_000);
    const available = await isSlotAvailable(courtId, start, end);

    if (available) {
      const expiresAt = new Date(Date.now() + QUEUE_DEFAULT_TIMEOUT_MIN * 60_000);
      await supabase
        .from('queue_entries')
        .update({
          status: 'offered',
          court_id: courtId,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);

      await publishDisplay(courtId, {
        line1: 'COURT AVAILABLE',
        line2: `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')} – ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`,
        line3: 'PLEASE CONFIRM AT TERMINAL',
      });

      return;
    }
  }

  await publishDisplay(courtId, {
    line1: 'COURT AVAILABLE',
    line2: '',
    line3: 'WAITING FOR COMPATIBLE QUEUE',
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/queue/queue-processor.test.ts 2>&1 | tail -15`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/queue-processor.ts src/lib/queue/queue-processor.test.ts
git commit -m "feat: add queue processor with court assignment and offer expiry"
```

---

### Task 6: Reservation service

**Files:**
- Create: `src/lib/queue/reservation-service.ts`
- Create: `src/lib/queue/reservation-service.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/queue/reservation-service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ isSlotAvailable: vi.fn() }))
vi.mock('./queue-processor', () => ({ processCourt: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable } from './booking-engine'
import { processCourt } from './queue-processor'
import { acceptOffer, declineOffer, expireOffer } from './reservation-service'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
  }
  return { from: vi.fn(() => chain), rpc: vi.fn() }
}

describe('acceptOffer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers game and marks entry completed', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), in: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.single = vi.fn()
      if (t === 'queue_entries') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({
          data: { id: 'qe-1', member_id: 'm1', court_id: 'c1', duration: 60, party_size: 2, player_ids: ['m1', 'm2'], requested_start: '2026-07-07T14:00:00Z', expires_at: '2099-01-01T00:00:00Z' },
          error: null,
        }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await acceptOffer('qe-1')
    expect(result.success).toBe(true)
  })

  it('returns error when slot is no longer available', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(false)
    const db = makeDb()
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(async () => ({
            data: { id: 'qe-1', court_id: 'c1', expires_at: '2099-01-01T00:00:00Z' },
            error: null,
          })),
        })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await acceptOffer('qe-1')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/no longer available/i)
  })
})

describe('declineOffer', () => {
  it('marks declined and processes next', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await declineOffer('qe-1', 'c1')
    expect(processCourt).toHaveBeenCalledWith('c1')
  })
})

describe('expireOffer', () => {
  it('marks expired and processes next', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await expireOffer('qe-1', 'c1')
    expect(processCourt).toHaveBeenCalledWith('c1')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/queue/reservation-service.test.ts 2>&1 | tail -15`

Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/queue/reservation-service.ts
import { createClient } from '@/lib/supabase/server';
import { isSlotAvailable } from './booking-engine';
import { processCourt } from './queue-processor';
import { publishDisplay } from '@/lib/mqtt';

export async function acceptOffer(entryId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('id', entryId)
    .single();
  if (!entry) return { success: false, error: 'Queue entry not found' };
  if (entry.status !== 'offered') return { success: false, error: 'Offer already processed' };
  if (new Date(entry.expires_at) < new Date()) {
    await expireOffer(entryId, entry.court_id);
    return { success: false, error: 'Offer expired' };
  }

  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('id', entry.member_id)
    .single();
  if (!member || member.status !== 'Active') {
    await supabase.from('queue_entries').update({ status: 'insufficient_credits', updated_at: new Date().toISOString() }).eq('id', entryId);
    if (entry.court_id) await processCourt(entry.court_id);
    return { success: false, error: 'Member not active' };
  }

  const start = new Date(entry.requested_start);
  const end = new Date(start.getTime() + entry.duration * 60_000);
  if (!entry.court_id || !(await isSlotAvailable(entry.court_id, start, end))) {
    await supabase.from('queue_entries').update({ status: 'waiting', court_id: null, expires_at: null, updated_at: new Date().toISOString() }).eq('id', entryId);
    if (entry.court_id) await processCourt(entry.court_id);
    return { success: false, error: 'Court no longer available' };
  }

  const { data: court } = await supabase.from('courts').select('name').eq('id', entry.court_id).single();
  const { data: rfidCards } = await supabase
    .from('rfid_cards')
    .select('uid, member_id')
    .in('member_id', entry.player_ids)
    .eq('status', 'Active');

  const rfidMap = new Map((rfidCards ?? []).map(r => [r.member_id, r.uid]));
  const players = (entry.player_ids as string[]).map((pid, i) => ({
    rfid: rfidMap.get(pid) || '',
    team: entry.party_size === 4 ? (i < 2 ? 'Team A' : 'Team B') : null,
    charge_amount: 0,
  }));

  const { error: gameErr } = await supabase.rpc('register_game', {
    p_court_name: court?.name ?? '',
    p_match_type: entry.party_size === 4 ? '2v2' : '1v1',
    p_duration: entry.duration,
    p_players: JSON.stringify(players),
  });

  if (gameErr) {
    if (gameErr.message?.toLowerCase().includes('insufficient')) {
      await supabase.from('queue_entries').update({ status: 'insufficient_credits', updated_at: new Date().toISOString() }).eq('id', entryId);
      if (entry.court_id) await processCourt(entry.court_id);
      return { success: false, error: 'Insufficient credits' };
    }
    return { success: false, error: gameErr.message };
  }

  await supabase.from('queue_entries').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', entryId);

  await publishDisplay(entry.court_id, {
    line1: court?.name?.toUpperCase() ?? 'COURT',
    line2: 'GAME STARTED',
    line3: 'RUNNING',
  });

  return { success: true };
}

export async function declineOffer(entryId: string, courtId: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase.from('queue_entries').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', entryId);
  if (courtId) await processCourt(courtId);
}

export async function expireOffer(entryId: string, courtId: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase.from('queue_entries').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', entryId);
  if (courtId) await processCourt(courtId);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/queue/reservation-service.test.ts 2>&1 | tail -15`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/reservation-service.ts src/lib/queue/reservation-service.test.ts
git commit -m "feat: add reservation service with accept, decline, and expire"
```

---

### Task 7: Update Supabase Realtime for queue_entries

Enable Realtime on the `queue_entries` table so the terminal can subscribe to changes.

- [ ] **Step 1: Enable Realtime publication**

Run in Supabase SQL Editor:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE queue_entries;
```

---

### Task 8: Terminal — migrate from game-store to Supabase queue

**Files:**
- Full rewrite: `src/app/terminal/page.tsx`
- Delete: `src/app/api/public/courts/route.ts`
- Delete: `src/app/api/public/players/route.ts`
- Delete: `src/app/api/public/rfid/[uid]/route.ts`
- Delete: `src/app/api/public/queue/route.ts`
- Delete: `src/app/api/public/game/start/route.ts`
- Delete: `src/app/api/public/game/end/route.ts`

- [ ] **Step 1: Rewrite terminal page**

Replace `src/app/terminal/page.tsx` with a new implementation:

The new terminal flow:
1. **Scan** — RFID input identifies member (unchanged)
2. **Players** — Add players by RFID scan, show scanned members
3. **Duration + Party** — Choose 30/60/90 min, system determines 1v1/2v2 from player count
4. **Booking check** — Calls `joinQueue` server action (which either books immediately or joins queue)
5. **Queue status** — If queued, show position via Supabase Realtime subscription
6. **Offer** — If offered a court, show accept/decline with countdown
7. **Confirmed** — Success screen with court, time, credits used

Key changes from current:
- Remove court selection step (engine assigns)
- Remove match type selection (inferred from party size)
- Use Supabase Realtime instead of polling `game-store.ts`
- Use `createClient()` from `@/lib/supabase/client` for browser-side subscriptions
- Show live queue updates (position, offers, confirmations)

The implementation should subscribe to:

```ts
const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

supabase.channel('queue')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'queue_entries',
      filter: `member_id=eq.${memberId}` },
    (payload) => { /* update UI */ }
  )
  .subscribe()
```

And integrate with the `startExpiryProcessor()` by calling it on the server side (in a layout or API route).

- [ ] **Step 2: Delete old public API routes**

```bash
rm -f src/app/api/public/courts/route.ts
rm -f src/app/api/public/players/route.ts
rm -f src/app/api/public/rfid/\[uid\]/route.ts
rm -f src/app/api/public/queue/route.ts
rm -f src/app/api/public/game/start/route.ts
rm -f src/app/api/public/game/end/route.ts
```

- [ ] **Step 3: Remove game-store.ts**

```bash
rm -f src/lib/game-store.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/app/terminal/page.tsx
git rm src/lib/game-store.ts
git rm -r src/app/api/public/
git commit -m "feat: migrate terminal to Supabase queue, retire game-store and public API"
```

---

### Task 9: Update admin QueuePanel

**Files:**
- Modify: `src/components/courts/QueuePanel.tsx`

- [ ] **Step 1: Rewrite QueuePanel to use queue_entries**

Replace the component to query `queue_entries` table with the new statuses. Add admin actions:

- **Start** → calls `acceptOffer` via PATCH
- **Remove** → calls `leaveQueue` via DELETE
- **Extend** → extends `expires_at` by 5 min
- **Status filter** → filter by queue entry status

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';

type QueueEntry = {
  id: string;
  member_id: string;
  requested_start: string;
  duration: number;
  party_size: number;
  status: string;
  court_id: string | null;
  expires_at: string | null;
  created_at: string;
};

type Props = {
  courts: { id: string; name: string }[];
};

const STATUS_COLORS: Record<string, string> = {
  waiting: 'bg-yellow-100 text-yellow-800',
  offered: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-800',
  insufficient_credits: 'bg-orange-100 text-orange-800',
};

export default function QueuePanel({ courts }: Props) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchQueue() {
    const supabase = createClient();
    const { data } = await supabase
      .from('queue_entries')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setEntries(data);
  }

  useEffect(() => { fetchQueue(); const id = setInterval(fetchQueue, 5000); return () => clearInterval(id); }, []);

  const visible = entries.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterCourt !== 'all' && e.court_id !== filterCourt) return false;
    return true;
  });

  async function extendOffer(id: string) {
    setBusy(id);
    const supabase = createClient();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    await supabase.from('queue_entries').update({ expires_at: expiresAt }).eq('id', id);
    await fetchQueue();
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(id);
    const supabase = createClient();
    await supabase.from('queue_entries').update({ status: 'cancelled' }).eq('id', id);
    await fetchQueue();
    setBusy(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          Queue
          <div className="flex items-center gap-2">
            <Badge variant="outline">{entries.filter(e => e.status === 'waiting').length} waiting</Badge>
            <Select value={filterStatus} onValueChange={v => v && setFilterStatus(v)}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="offered">Offered</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCourt} onValueChange={v => v && setFilterCourt(v)}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Court" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courts</SelectItem>
                {courts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No entries</p>
        ) : (
          <div className="space-y-2">
            {visible.map(entry => (
              <div key={entry.id} className="rounded border p-3 text-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-medium truncate">
                      #{entry.id.slice(0, 8)} · {entry.duration} min · {entry.party_size === 4 ? '2v2' : '1v1'}
                    </div>
                    <Badge className={STATUS_COLORS[entry.status] ?? ''}>{entry.status}</Badge>
                    {entry.expires_at && <span className="text-xs text-muted-foreground ml-2">Expires: {new Date(entry.expires_at).toLocaleTimeString()}</span>}
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {entry.status === 'offered' && (
                    <Button size="sm" disabled={busy === entry.id} onClick={() => extendOffer(entry.id)}>Extend</Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy === entry.id} onClick={() => remove(entry.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Update courts/page.tsx to pass courts to QueuePanel**

Modify the courts page to pass the `courts` prop instead of `initialQueue`.

- [ ] **Step 3: Commit**

```bash
git add src/components/courts/QueuePanel.tsx src/app/\(dashboard\)/courts/page.tsx
git commit -m "feat: update QueuePanel for new queue_entries table and admin actions"
```

---

### Task 10: Wire up expiry processor in app layout

**Files:**
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Start the expiry processor on server startup**

Add a side-effect import or initialize in a server component. The simplest approach is to add it in the root layout or a server component that runs once on startup.

In `src/app/layout.tsx`, add:

```ts
import { startExpiryProcessor } from '@/lib/queue/queue-processor';

// Start the queue expiry processor on server startup
if (typeof globalThis !== 'undefined') {
  // @ts-ignore - guard against multiple calls
  if (!globalThis._queueProcessorStarted) {
    globalThis._queueProcessorStarted = true;
    startExpiryProcessor();
  }
}
```

- [ ] **Step 2: Verify no type errors**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | head -20`

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat: start queue expiry processor on app startup"
```

---

### Task 11: Run full test suite

- [ ] **Step 1: Run all queue tests**

```bash
npx vitest run src/lib/queue/ 2>&1 | tail -15
```

Expected: all tests pass.

- [ ] **Step 2: Run full vitest suite**

```bash
npx vitest run 2>&1 | tail -25
```

Expected: existing passing tests still pass. The two queue route tests (`queue/route.test.ts` and `queue/[id]/route.test.ts`) reference Prisma and will fail — they were already broken before this work.

- [ ] **Step 3: Fix any failures**

If any previously-passing tests fail due to the changes, fix them.

---

### Task 12: End-to-end manual verification

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Exercise the queue from the terminal**

Open `http://localhost:3000/terminal` in test mode (`?testmode=true`). Walk through:
1. Scan/add players
2. Pick duration
3. If courts are free → immediate booking shown
4. If courts are busy → queue position shown, positions update in real-time

- [ ] **Step 3: Exercise from admin dashboard**

1. Go to Court Monitor
2. Verify queue entries appear with correct statuses
3. Test extend/remove actions
4. Verify MQTT display updates when queue is processed

- [ ] **Step 4: Verify Realtime updates**

Open the terminal in two browser tabs. Add a queue entry from one tab. Verify the other tab updates in real-time without refresh.
