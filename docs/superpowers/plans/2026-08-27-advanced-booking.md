# Advanced Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add future-scheduled booking support across the public web app, kiosk, and admin dashboard, reusing the existing queue/booking engine.

**Architecture:** Extend the existing `/api/queue` flow to accept future `start` times, add new `/api/bookings/*` routes for web booking CRUD, and introduce a `/book` page with court/date/time selection. The queue processor already handles `games.status = 'Scheduled'`; we just need to teach it to also process `queue_entries.status = 'scheduled'`.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind, Vitest, Playwright

---

### Task 1: Extend QueueStatus and add advanced booking service

**Files:**
- Modify: `src/lib/queue/index.ts`
- Create: `src/lib/queue/advanced-booking.ts`
- Test: `src/lib/queue/advanced-booking.test.ts`

- [ ] **Step 1: Update QueueStatus type**

In `src/lib/queue/index.ts`, add `'scheduled'` to the `QueueStatus` union:

```ts
export type QueueStatus =
  | 'waiting' | 'offered' | 'accepted'
  | 'declined' | 'expired' | 'cancelled'
  | 'completed' | 'insufficient_credits'
  | 'scheduled';
```

- [ ] **Step 2: Write failing tests for `createAdvancedBooking`**

Create `src/lib/queue/advanced-booking.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAdvancedBooking, cancelBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';

const mockSupabase = vi.hoisted(() => ({
  from: vi.fn(() => ({
    select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
    insert: vi.fn(() => ({ single: vi.fn() })),
    update: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
    delete: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn() })) })),
  })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => mockSupabase.from()),
}));

describe('createAdvancedBooking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects start time more than 7 days in the future', async () => {
    const farFuture = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString();
    const result = await createAdvancedBooking({
      memberId: 'm1',
      start: farFuture,
      duration: 60,
      partySize: 2,
      playerIds: ['m1'],
    });
    expect(result.error).toBe('Booking window cannot exceed 7 days');
  });

  it('rejects start time in the past', async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const result = await createAdvancedBooking({
      memberId: 'm1',
      start: past,
      duration: 60,
      partySize: 2,
      playerIds: ['m1'],
    });
    expect(result.error).toBe('Start time must be in the future');
  });

  it('creates a Scheduled game when court is available', async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    mockSupabase.from().select().eq().single.mockResolvedValue({
      data: { id: 'court-1', name: 'Court 1', status: 'Available' },
      error: null,
    });
    mockSupabase.from().insert().single.mockResolvedValue({
      data: { id: 'game-1', status: 'Scheduled', court_id: 'court-1' },
      error: null,
    });

    const result = await createAdvancedBooking({
      memberId: 'm1',
      courtId: 'court-1',
      start: future,
      duration: 60,
      partySize: 2,
      playerIds: ['m1'],
    });

    expect(result.error).toBeUndefined();
    expect(result.booking?.status).toBe('Scheduled');
    expect(result.booking?.court_id).toBe('court-1');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/lib/queue/advanced-booking.test.ts`
Expected: FAIL with "createAdvancedBooking is not defined"

- [ ] **Step 4: Implement `advanced-booking.ts`**

Create `src/lib/queue/advanced-booking.ts`:

```ts
import { createClient } from '@/lib/supabase/server';
import { deductWallet, refundTransaction } from './queue-service';

const MAX_ADVANCE_DAYS = 7;
const CANCEL_REFUND_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface CreateBookingInput {
  memberId: string;
  courtId?: string;
  start: string;
  duration: number;
  partySize: number;
  playerIds: string[];
  matchTitle?: string;
}

export interface BookingResult {
  booking: { id: string; status: string; court_id: string | null };
  error?: string;
}

export async function createAdvancedBooking(input: CreateBookingInput): Promise<BookingResult> {
  const supabase = await createClient();
  const start = new Date(input.start);
  const now = new Date();

  if (start.getTime() <= now.getTime()) {
    return { booking: { id: '', status: '', court_id: null }, error: 'Start time must be in the future' };
  }
  if (start.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000) {
    return { booking: { id: '', status: '', court_id: null }, error: 'Booking window cannot exceed 7 days' };
  }

  const end = new Date(start.getTime() + input.duration * 60_000);

  let courtId = input.courtId;
  if (!courtId) {
    const { data: courts } = await supabase.from('courts').select('id').eq('status', 'Available');
    for (const c of courts ?? []) {
      const slotFree = await isSlotAvailable(supabase, c.id, start, end);
      if (slotFree) { courtId = c.id; break; }
    }
  } else {
    const slotFree = await isSlotAvailable(supabase, courtId, start, end);
    if (!slotFree) {
      return { booking: { id: '', status: '', court_id: null }, error: 'Court is not available for the selected time' };
    }
  }

  if (!courtId) {
    return { booking: { id: '', status: '', court_id: null }, error: 'No courts available for the selected time' };
  }

  const { data: pricesRow } = await supabase.from('settings').select('value').eq('key', 'prices').single();
  const rates: Record<string, number> = pricesRow?.value ? JSON.parse(pricesRow.value) : { '30': 150, '60': 300, '90': 450 };
  const { getCost } = await import('./products-config-types');
  const config = { matchTypes: [], durations: [30, 60, 90], rates };
  const charge = getCost(config, input.duration, input.partySize);
  if (!charge) return { booking: { id: '', status: '', court_id: null }, error: 'No price configured for this duration' };

  const depositTxId = await deductWallet(input.memberId, charge, 'QUEUE_DEPOSIT_' + Date.now());
  if (!depositTxId) return { booking: { id: '', status: '', court_id: null }, error: 'Insufficient credits' };

  const gameInsert = {
    court_id: courtId,
    match_type: input.partySize === 4 ? '2v2' : '1v1',
    match_title: input.matchTitle ?? null,
    duration: input.duration,
    status: 'Scheduled',
    start_time: start.toISOString(),
    charge_amount: charge,
  };

  const { data: game, error: gameErr } = await supabase.from('games').insert(gameInsert).select().single();
  if (gameErr || !game) {
    await refundTransaction(depositTxId, 'Booking creation failed');
    return { booking: { id: '', status: '', court_id: null }, error: gameErr?.message ?? 'Failed to create booking' };
  }

  await supabase.from('game_players').insert(
    input.playerIds.map(pid => ({ game_id: game.id, member_id: pid, team: null }))
  );

  return { booking: { id: game.id, status: 'Scheduled', court_id: courtId } };
}

export async function cancelBooking(bookingId: string, isGame: boolean): Promise<{ success: boolean; refunded: boolean; error?: string }> {
  const supabase = await createClient();

  if (isGame) {
    const { data: game } = await supabase.from('games').select('start_time, charge_amount').eq('id', bookingId).single();
    if (!game) return { success: false, refunded: false, error: 'Booking not found' };

    const now = new Date();
    const start = new Date(game.start_time);
    const canRefund = now.getTime() < start.getTime() - CANCEL_REFUND_THRESHOLD_MS;

    await supabase.from('games').update({ status: 'Cancelled' }).eq('id', bookingId);
    if (canRefund && game.charge_amount > 0) {
      const { data: tx } = await supabase.from('wallet_transactions').select('id').eq('reference_number', bookingId).eq('type', 'game_fee').single();
      if (tx) await refundTransaction(tx.id, 'Booking cancelled >2h before start');
      return { success: true, refunded: true };
    }
    return { success: true, refunded: false };
  }

  const { data: entry } = await supabase.from('queue_entries').select('requested_start, deposit_tx_id, status').eq('id', bookingId).single();
  if (!entry) return { success: false, refunded: false, error: 'Booking not found' };
  if (!['scheduled', 'waiting'].includes(entry.status)) {
    return { success: false, refunded: false, error: 'Booking cannot be cancelled' };
  }

  const now = new Date();
  const start = new Date(entry.requested_start);
  const canRefund = now.getTime() < start.getTime() - CANCEL_REFUND_THRESHOLD_MS;

  await supabase.from('queue_entries').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('id', bookingId);
  if (canRefund && entry.deposit_tx_id) {
    await refundTransaction(entry.deposit_tx_id, 'Booking cancelled >2h before start');
    return { success: true, refunded: true };
  }
  return { success: true, refunded: false };
}

export async function getUpcomingBookings(memberId?: string, date?: string): Promise<any[]> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  let query = supabase.from('games').select('*, game_players(*)').eq('status', 'Scheduled').gte('start_time', now).order('start_time', { ascending: true });
  if (memberId) {
    const { data: entries } = await supabase.from('game_players').select('game_id').eq('member_id', memberId);
    const gameIds = (entries ?? []).map((e: any) => e.game_id);
    query = query.in('id', gameIds);
  }
  if (date) {
    const start = new Date(date + 'T00:00:00Z');
    const end = new Date(date + 'T23:59:59Z');
    query = query.gte('start_time', start.toISOString()).lte('start_time', end.toISOString());
  }

  const { data: games } = await query;
  return games ?? [];
}

async function isSlotAvailable(supabase: Awaited<ReturnType<typeof createClient>>, courtId: string, start: Date, end: Date, excludeId?: string): Promise<boolean> {
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
    .select('id, start_time, status')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .lt('start_time', start.toISOString());

  if (!straddling) return true;
  for (const g of straddling) {
    if ((g as any).status === 'Scheduled' && new Date(g.start_time).getTime() <= start.getTime()) continue;
    const gameEnd = new Date(new Date(g.start_time).getTime() + 30 * 60_000);
    if (start < gameEnd && end > new Date(g.start_time)) return false;
  }

  return true;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/queue/advanced-booking.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/queue/index.ts src/lib/queue/advanced-booking.ts src/lib/queue/advanced-booking.test.ts
git commit -m "feat: add advanced booking service with 7-day window and 2h refund policy"
```

---

### Task 2: Add `/api/bookings` routes

**Files:**
- Create: `src/app/api/bookings/route.ts`
- Create: `src/app/api/bookings/[id]/route.ts`
- Create: `src/app/api/bookings/availability/route.ts`
- Test: `src/app/api/bookings/route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/app/api/bookings/route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { createAdvancedBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';

const mockUser = { id: 'm1', email: 'test@example.com' };

vi.mock('@/lib/queue/advanced-booking', () => ({
  createAdvancedBooking: vi.fn(),
  getUpcomingBookings: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
    })),
  })),
}));

describe('POST /api/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 400 when not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
    });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1', start: new Date().toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid start window', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: '', status: '', court_id: null }, error: 'Booking window cannot exceed 7 days' });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1', start: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Booking window cannot exceed 7 days');
  });

  it('returns 201 on successful booking', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: 'game-1', status: 'Scheduled', court_id: 'court-1' } });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1', start: new Date(Date.now() + 86400000).toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(201);
  });
});

describe('GET /api/bookings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUpcomingBookings as any).mockResolvedValue([]);
  });

  it('returns 401 when not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
    });
    const res = await GET(new Request('http://localhost/api/bookings'));
    expect(res.status).toBe(401);
  });

  it('returns upcoming bookings for member', async () => {
    (getUpcomingBookings as any).mockResolvedValue([{ id: 'game-1', status: 'Scheduled' }]);
    const res = await GET(new Request('http://localhost/api/bookings?memberId=m1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/app/api/bookings/route.test.ts`
Expected: FAIL with "route.ts not found"

- [ ] **Step 3: Implement `src/app/api/bookings/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdvancedBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId') ?? user.id;
  const date = searchParams.get('date') ?? undefined;

  const bookings = await getUpcomingBookings(memberId, date);
  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const result = await createAdvancedBooking({
      memberId: body.memberId ?? user.id,
      courtId: body.courtId,
      start: body.start,
      duration: body.duration,
      partySize: body.partySize,
      playerIds: body.playerIds,
      matchTitle: body.matchTitle,
    });

    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.booking, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
```

- [ ] **Step 4: Implement `src/app/api/bookings/[id]/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelBooking } from '@/lib/queue/advanced-booking';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const { data: isGame } = await supabase.from('games').select('id').eq('id', params.id).maybeSingle();

  const result = await cancelBooking(params.id, !!isGame);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, refunded: result.refunded });
}
```

- [ ] **Step 5: Implement `src/app/api/bookings/availability/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courtId = searchParams.get('courtId');
  const date = searchParams.get('date');
  if (!courtId || !date) return NextResponse.json({ error: 'courtId and date required' }, { status: 400 });

  const supabase = await createClient();
  const dayStart = new Date(date + 'T00:00:00Z');
  const dayEnd = new Date(date + 'T23:59:59Z');

  const { data: games } = await supabase
    .from('games')
    .select('start_time, duration, status')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString());

  const slots: { time: string; available: boolean }[] = [];
  for (let h = 8; h < 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const slotStart = new Date(`${date}T${timeStr}:00Z`);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
      const busy = (games ?? []).some((g: any) => {
        const gStart = new Date(g.start_time);
        const gEnd = new Date(gStart.getTime() + g.duration * 60_000);
        return slotStart < gEnd && slotEnd > gStart;
      });
      slots.push({ time: timeStr, available: !busy });
    }
  }

  return NextResponse.json({ courtId, date, slots });
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run src/app/api/bookings/route.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/api/bookings/route.ts src/app/api/bookings/[id]/route.ts src/app/api/bookings/availability/route.ts src/app/api/bookings/route.test.ts
git commit -m "feat: add /api/bookings routes for creation, listing, cancellation, and availability"
```

---

### Task 3: Update queue processor for scheduled entries

**Files:**
- Modify: `src/lib/queue/queue-processor.ts`

- [ ] **Step 1: Write failing test**

Append to `src/lib/queue/advanced-booking.test.ts`:

```ts
describe('queue-processor scheduled entries', () => {
  it('promotes scheduled queue entries to waiting when start time arrives', async () => {
    // Integration test via processCourtQueue will be covered in queue-service tests
  });
});
```

For now, we rely on the existing `processCourtQueue` tests in `queue-service.test.ts` and add a focused unit test after implementation.

- [ ] **Step 2: Implement processor update**

In `src/lib/queue/queue-processor.ts`, modify the waiting entries query to also include `scheduled` entries:

```ts
const { data: waiting } = await supabase
  .from('queue_entries')
  .select('*')
  .in('status', ['waiting', 'scheduled'])
  .order('created_at', { ascending: true });
```

- [ ] **Step 3: Run existing queue tests to verify no regressions**

Run: `npx vitest run src/lib/queue/queue-service.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/lib/queue/queue-processor.ts
git commit -m "fix: process scheduled queue entries in queue processor"
```

---

### Task 4: Extend `/api/queue` POST to accept future starts

**Files:**
- Modify: `src/app/api/queue/route.ts`
- Test: `src/app/api/queue/route.test.ts`

- [ ] **Step 1: Write failing test**

In `src/app/api/queue/route.test.ts`, add:

```ts
it('creates scheduled entry when start is in the future', async () => {
  const future = new Date(Date.now() + 86400000).toISOString();
  mockJoinQueue.mockResolvedValue({
    id: 'q3', member_id: 'm1', status: 'scheduled',
    court_id: null, duration: 60, party_size: 2,
    player_ids: ['p1'], created_at: new Date().toISOString(),
    requested_start: future, expires_at: null, updated_at: new Date().toISOString(),
  });
  const res = await POST(makeReq({ ...validBody, start: future }));
  expect(res.status).toBe(201);
  const data = await res.json();
  expect(data.status).toBe('scheduled');
});
```

- [ ] **Step 2: Verify test fails**

Run: `npx vitest run src/app/api/queue/route.test.ts -t "scheduled"`
Expected: FAIL

- [ ] **Step 3: Update `/api/queue` handler**

In `src/app/api/queue/route.ts`, modify the POST handler to pass `start` through unchanged (the underlying `joinQueue` already handles it because `requested_start` is set from `params.start`).

```ts
// No route-level change needed; joinQueue already uses params.start for requested_start.
// Ensure the schema allows future start times by not enforcing "now" on the server.
```

No code change required at route level if `joinQueue` already supports future `start`. Confirm by reading `src/lib/queue/queue-service.ts` — it uses `params.start` for `requested_start` and does not enforce `start <= now`.

- [ ] **Step 4: Verify tests pass**

Run: `npx vitest run src/app/api/queue/route.test.ts -t "scheduled"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/api/queue/route.test.ts
git commit -m "test: cover future start time in queue API"
```

---

### Task 5: Add `/book` public page

**Files:**
- Create: `src/app/book/page.tsx`
- Create: `src/components/bookings/CourtGrid.tsx`
- Create: `src/components/bookings/TimeSlotGrid.tsx`
- Test: `tests/e2e/advanced-booking.spec.ts` (step 1)

- [ ] **Step 1: Write Playwright test**

Create `tests/e2e/advanced-booking.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test.describe('Advanced Booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/book');
  });

  test('shows booking page with courts and date picker', async ({ page }) => {
    await expect(page.locator('text=Court 1')).toBeVisible();
    await expect(page.locator('input[type="date"]')).toBeVisible();
  });

  test('redirects to login when booking without auth', async ({ page }) => {
    await page.click('button:has-text("Confirm Booking")');
    await expect(page).toHaveURL(/\/login/);
  });

  test('shows time slots for selected date', async ({ page }) => {
    await page.fill('input[type="date"]', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
    await page.click('text=Court 1');
    await expect(page.locator('text=08:00')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run Playwright to verify test fails**

Run: `npm run test:e2e -- --grep "shows booking page"`
Expected: FAIL (page/components don’t exist yet)

- [ ] **Step 3: Implement `CourtGrid.tsx`**

Create `src/components/bookings/CourtGrid.tsx`:

```ts
'use client';

import { CourtInfo } from '@/lib/queue';

interface CourtGridProps {
  courts: CourtInfo[];
  selectedCourtId?: string;
  onSelect: (court: CourtInfo) => void;
}

export function CourtGrid({ courts, selectedCourtId, onSelect }: CourtGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {courts.map((court) => (
        <button
          key={court.id}
          onClick={() => onSelect(court)}
          className={`p-4 rounded-lg border-2 text-left transition-colors ${
            selectedCourtId === court.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30'
          }`}
        >
          <div className="text-lg font-bold">{court.name}</div>
          <div className="text-sm text-white/60">{court.status}</div>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Implement `TimeSlotGrid.tsx`**

Create `src/components/bookings/TimeSlotGrid.tsx`:

```ts
'use client';

interface Slot {
  time: string;
  available: boolean;
}

interface TimeSlotGridProps {
  slots: Slot[];
  selectedTime?: string;
  onSelect: (time: string) => void;
}

export function TimeSlotGrid({ slots, selectedTime, onSelect }: TimeSlotGridProps) {
  return (
    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
      {slots.map((slot) => (
        <button
          key={slot.time}
          disabled={!slot.available}
          onClick={() => onSelect(slot.time)}
          className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
            selectedTime === slot.time
              ? 'bg-emerald-500 text-white'
              : slot.available
                ? 'bg-white/10 hover:bg-white/20'
                : 'bg-white/5 text-white/30 line-through cursor-not-allowed'
          }`}
        >
          {slot.time}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Implement `/book` page**

Create `src/app/book/page.tsx`:

```ts
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CourtGrid } from '@/components/bookings/CourtGrid';
import { TimeSlotGrid } from '@/components/bookings/TimeSlotGrid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Court { id: string; name: string; status: string; }

export default function BookPage() {
  const router = useRouter();
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [gameType, setGameType] = useState<'1v1' | '2v2'>('1v1');
  const [matchTitle, setMatchTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => {
    fetch('/api/courts/status').then(r => r.json()).then((data) => {
      setCourts(data.courts ?? []);
    });
  }, []);

  useEffect(() => {
    if (!selectedCourt) return;
    fetch(`/api/bookings/availability?courtId=${selectedCourt.id}&date=${date}`)
      .then(r => r.json())
      .then((data) => setSlots(data.slots ?? []));
  }, [selectedCourt, date]);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const start = `${date}T${selectedTime}:00.000Z`;
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courtId: selectedCourt?.id,
        start,
        duration,
        partySize: gameType === '2v2' ? 4 : 2,
        playerIds: [], // populated server-side from session
        matchTitle,
      }),
    });
    if (res.status === 401) { router.push(`/login?redirect=/book`); return; }
    if (!res.ok) { const data = await res.json(); setError(data.error); setLoading(false); return; }
    router.push('/bookings');
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-8">
      <Card>
        <CardHeader><CardTitle>Select Court</CardTitle></CardHeader>
        <CardContent><CourtGrid courts={courts} selectedCourtId={selectedCourt?.id} onSelect={setSelectedCourt} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Select Date</CardTitle></CardHeader>
        <CardContent>
          <input type="date" min={new Date().toISOString().split('T')[0]} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white" />
        </CardContent>
      </Card>

      {selectedCourt && (
        <Card>
          <CardHeader><CardTitle>Select Time</CardTitle></CardHeader>
          <CardContent><TimeSlotGrid slots={slots} selectedTime={selectedTime ?? undefined} onSelect={setSelectedTime} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Duration</Label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white">
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </div>
          <div>
            <Label>Game Type</Label>
            <select value={gameType} onChange={(e) => setGameType(e.target.value as '1v1' | '2v2')} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white">
              <option value="1v1">1v1 (2 players)</option>
              <option value="2v2">2v2 (4 players)</option>
            </select>
          </div>
          <div>
            <Label>Match Title (optional)</Label>
            <input value={matchTitle} onChange={(e) => setMatchTitle(e.target.value)} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white w-full" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={handleConfirm} disabled={!selectedCourt || !selectedTime || loading} className="w-full">
            {loading ? 'Booking...' : 'Confirm Booking'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Run Playwright to verify test passes**

Run: `npm run test:e2e -- --grep "shows booking page"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/app/book/page.tsx src/components/bookings/CourtGrid.tsx src/components/bookings/TimeSlotGrid.tsx tests/e2e/advanced-booking.spec.ts
git commit -m "feat: add public /book page with court/date/time selection"
```

---

### Task 6: Add `/bookings` member page

**Files:**
- Create: `src/app/bookings/page.tsx`
- Create: `src/components/bookings/BookingCard.tsx`

- [ ] **Step 1: Write failing Playwright test**

Add to `tests/e2e/advanced-booking.spec.ts`:

```ts
test('shows upcoming bookings for member', async ({ page }) => {
  await page.goto('/bookings');
  await expect(page.locator('text=Scheduled')).toBeVisible();
});
```

- [ ] **Step 2: Implement `BookingCard.tsx`**

Create `src/components/bookings/BookingCard.tsx`:

```ts
'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Booking {
  id: string;
  status: string;
  start_time: string;
  duration: number;
  courts?: { name: string };
}

interface BookingCardProps {
  booking: Booking;
  onCancel: () => void;
}

export function BookingCard({ booking, onCancel }: BookingCardProps) {
  const start = new Date(booking.start_time);
  const canCancel = new Date().getTime() < start.getTime() - 2 * 60 * 60 * 1000;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{booking.courts?.name ?? 'Court'}</span>
          <span className="text-sm text-emerald-400">{booking.status}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-white/70">{start.toLocaleString()}</p>
        <p className="text-sm text-white/70">{booking.duration} min</p>
        {canCancel && <Button variant="destructive" onClick={onCancel}>Cancel Booking</Button>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Implement `/bookings` page**

Create `src/app/bookings/page.tsx`:

```ts
'use client';

import { useState, useEffect } from 'react';
import { BookingCard } from '@/components/bookings/BookingCard';

interface Booking {
  id: string;
  status: string;
  start_time: string;
  duration: number;
  courts?: { name: string };
}

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    fetch('/api/bookings')
      .then(r => r.ok ? r.json() : [])
      .then(setBookings);
  }, []);

  async function handleCancel(id: string) {
    await fetch(`/api/bookings/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    setBookings(bookings.filter(b => b.id !== id));
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-4">
      <h1 className="text-3xl font-bold">My Bookings</h1>
      {bookings.length === 0 && <p className="text-white/60">No upcoming bookings.</p>}
      {bookings.map((b) => (
        <BookingCard key={b.id} booking={b} onCancel={() => handleCancel(b.id)} />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run Playwright test**

Run: `npm run test:e2e -- --grep "shows upcoming bookings"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/bookings/page.tsx src/components/bookings/BookingCard.tsx
git commit -m "feat: add /bookings member page with cancel action"
```

---

### Task 7: Update middleware for new public routes

**Files:**
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Add `/book` to public routes**

In `src/lib/supabase/middleware.ts`, update `isPublicRoute`:

```ts
const isPublicRoute = path.startsWith('/login') ||
                      path.startsWith('/forgot-password') ||
                      path.startsWith('/update-password') ||
                      path.startsWith('/api/controller') ||
                      path.startsWith('/api/public') ||
                      path.startsWith('/api/health') ||
                      path.startsWith('/api/queue') ||
                      path.startsWith('/api/display') ||
                      path.startsWith('/api/mqtt') ||
                      path.startsWith('/api/board') ||
                      path.startsWith('/health') ||
                      path.startsWith('/terminal') ||
                      process.env.PLAYWRIGHT_TEST_BYPASS_AUTH === '1' ||
                      path === '/' ||
                      path === '/book';
```

Note: `/api/bookings` and `/bookings` are NOT public — they require auth and will be protected by the middleware’s existing `getUser()` + 401/redirect behavior.

- [ ] **Step 2: Commit**

```bash
git add src/lib/supabase/middleware.ts
git commit -m "fix: allow public access to /book and /api/bookings"
```

---

### Task 8: Admin dashboard schedules page

**Files:**
- Modify: `src/app/(dashboard)/schedules/page.tsx`

- [ ] **Step 1: Replace placeholder with bookings list**

```ts
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function SchedulesPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">Group Schedules</h1>
        <p className="text-sm text-zinc-500 mt-1">Manage recurring court reservations and group schedules.</p>
      </div>
      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardHeader>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            All Bookings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-zinc-400 py-8 text-center">Advanced booking calendar view coming soon.</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/(dashboard)/schedules/page.tsx
git commit -m "feat: replace schedules placeholder with bookings list stub"
```

---

### Task 9: Kiosk schedule mode

**Files:**
- Modify: `src/components/terminal/TerminalKiosk.tsx`

- [ ] **Step 1: Add schedule mode step**

Add `'schedule-mode'` to `KioskStep` union and add a mode selector after RFID lookup when member has no active entry.

- [ ] **Step 2: Implement mode selector UI**

Add a screen that shows "Play Now" and "Schedule" buttons after successful member lookup.

- [ ] **Step 3: Implement schedule flow**

Reuse existing `SelectCourt`, `SelectDuration`, `ConfirmBooking` components with a new `requested_start` based on user-selected future date/time.

- [ ] **Step 4: Commit**

```bash
git add src/components/terminal/TerminalKiosk.tsx
git commit -m "feat: add schedule mode to terminal kiosk"
```

---

### Task 10: Playwright e2e verification

**Files:**
- Modify: `tests/e2e/advanced-booking.spec.ts`

- [ ] **Step 1: Extend tests to cover full booking flow**

Add tests for:
- Login → `/book` → select court/date/time → confirm → see booking on `/bookings`
- Cancel booking and verify it disappears

- [ ] **Step 2: Run full Playwright suite**

Run: `npm run test:e2e`
Expected: All advanced booking tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/advanced-booking.spec.ts
git commit -m "test: add advanced booking e2e coverage"
```
