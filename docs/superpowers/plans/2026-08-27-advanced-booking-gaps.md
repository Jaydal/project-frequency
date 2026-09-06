# Advanced Booking Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining user-facing, admin, security, and test-coverage gaps in the advanced booking feature so it matches the approved design spec.

**Architecture:** Make small, focused additions on top of the existing advanced-booking service and routes. Add a confirmation step to the web booking flow, a dedicated kiosk success screen for scheduled bookings, a lightweight in-memory rate limiter, and extend tests to cover the new behavior. Keep the admin dashboard stub minimal but functional for viewing bookings.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase, Tailwind, Vitest, Playwright

---

### Task 1: Add price preview and booking confirmation to `/book`

**Files:**
- Modify: `src/app/book/page.tsx`
- Create: `src/components/bookings/BookingConfirmation.tsx`
- Test: `tests/e2e/advanced-booking.spec.ts`

- [ ] **Step 1: Add price preview calculation in `/book`**

In `src/app/book/page.tsx`, compute price from `/api/settings` or reuse `getCost` client-side if available. The simplest approach is to call `/api/bookings/availability` which already queries courts, or fetch `settings` directly. Add a read-only price line above the Confirm button:

```ts
const [price, setPrice] = useState<number | null>(null);

useEffect(() => {
  if (!duration || !gameType) return;
  fetch('/api/settings').then(r => r.json()).then((rows) => {
    const prices = rows.find((r: any) => r.key === 'prices')?.value ?? { '30': 150, '60': 300, '90': 450 };
    const rate = prices[String(duration)] ?? 0;
    const cost = Math.round((rate * (duration / 30)) / (gameType === '2v2' ? 2 : 1));
    setPrice(cost);
  });
}, [duration, gameType]);
```

Then render before Confirm:
```tsx
{price !== null && (
  <p className="text-sm text-white/70">Estimated cost: ₱{price}</p>
)}
```

- [ ] **Step 2: Write failing Playwright test**

Add to `tests/e2e/advanced-booking.spec.ts`:

```ts
test('shows estimated price before confirming', async ({ page }) => {
  const durationSelect = page.locator('select').first();
  await durationSelect.selectOption('60');
  await expect(page.locator('text=/Estimated cost: ₱/')).toBeVisible();
});
```

Run: `npx playwright test tests/e2e/advanced-booking.spec.ts --config=playwright.config.ci.ts --project=chromium --reporter=list --timeout=120000`
Expected: FAIL if selector/text not present yet.

- [ ] **Step 3: Implement `BookingConfirmation.tsx`**

Create `src/components/bookings/BookingConfirmation.tsx`:

```ts
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface BookingConfirmationProps {
  booking: {
    id: string;
    status: string;
    court_id: string | null;
    start_time: string;
    duration: number;
  };
  courtName?: string;
}

export function BookingConfirmation({ booking, courtName }: BookingConfirmationProps) {
  const start = new Date(booking.start_time);

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking Confirmed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-white/70">Booking ID: {booking.id}</p>
          <p className="text-sm text-white/70">Court: {courtName ?? booking.court_id ?? 'TBD'}</p>
          <p className="text-sm text-white/70">{start.toLocaleString()}</p>
          <p className="text-sm text-white/70">{booking.duration} min</p>
          <p className="text-sm text-emerald-400">{booking.status}</p>
          <Button onClick={() => window.location.href = '/bookings'} className="w-full">View My Bookings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 4: Update `/book` to use confirmation state**

In `src/app/book/page.tsx`, add:

```ts
const [bookingId, setBookingId] = useState<string | null>(null);
```

Update `handleConfirm`:

```ts
if (!res.ok) { const data = await res.json(); setError(data.error); setLoading(false); return; }
const data = await res.json();
setBookingId(data.id);
```

At the top of the component return, add:

```tsx
{bookingId && (
  <BookingConfirmation
    booking={{ id: bookingId, status: 'Scheduled', court_id: selectedCourt?.id ?? null, start_time: `${date}T${selectedTime}:00.000Z`, duration }}
    courtName={selectedCourt?.name}
  />
)}
{!bookingId && (
  <div className="max-w-4xl mx-auto py-12 px-4 space-y-8">...</div>
)}
```

- [ ] **Step 5: Run Playwright test to verify it passes**

Run: `npx playwright test tests/e2e/advanced-booking.spec.ts --config=playwright.config.ci.ts --project=chromium --reporter=list --timeout=120000`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/app/book/page.tsx src/components/bookings/BookingConfirmation.tsx tests/e2e/advanced-booking.spec.ts
git commit -m "feat: add price preview and booking confirmation on /book"
```

---

### Task 2: Add kiosk schedule confirmation screen

**Files:**
- Modify: `src/components/terminal/TerminalKiosk.tsx`

- [ ] **Step 1: Add `schedule-success` step to `KioskStep`**

In `src/components/terminal/TerminalKiosk.tsx`, update the union:

```ts
export type KioskStep =
  | 'booting'
  | 'idle'
  | 'existing-queue'
  | 'schedule-mode'
  | 'select-court'
  | 'select-game'
  | 'select-duration'
  | 'confirm'
  | 'offer'
  | 'success'
  | 'schedule-success'
  | 'error';
```

- [ ] **Step 2: Store scheduled booking details**

Add state:

```ts
const [scheduledBooking, setScheduledBooking] = useState<{ id: string; courtName: string; start: string; duration: number } | null>(null);
```

- [ ] **Step 3: Update `handleJoinQueue` for schedule mode**

After successful POST in `handleJoinQueue`, if `scheduleMode` is true and the response contains a booking id/start, capture it:

```ts
const entry = await res.json();
if (scheduleMode && entry.id) {
  setScheduledBooking({
    id: entry.id,
    courtName: selectedCourt?.name ?? 'Court',
    start: scheduleDate && scheduleTime ? `${scheduleDate}T${scheduleTime}:00.000Z` : new Date().toISOString(),
    duration: duration ?? 0,
  });
  setStep('schedule-success');
} else {
  setQueueEntry(entry);
  setStep(entry.status === 'completed' ? 'success' : 'existing-queue');
}
```

- [ ] **Step 4: Add `schedule-success` render case**

```ts
case 'schedule-success':
  return withLayout(
    scheduledBooking && (
      <div className="min-h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="size-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-400">
          <CalendarCheck className="size-6" />
        </div>
        <h2 className="text-lg font-black text-zinc-100 tracking-wide mb-2">Booking Scheduled</h2>
        <div className="bg-gradient-to-br from-primary/40 to-primary/20 border border-primary-foreground/10 rounded-2xl p-5 mb-8 w-full max-w-sm text-left shadow-md shadow-black/10 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest">Booking ID</span>
            <span className="text-xs font-black text-zinc-200">{scheduledBooking.id}</span>
          </div>
          <div className="h-px bg-zinc-850" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest">Court</span>
            <span className="text-xs font-black text-zinc-200">{scheduledBooking.courtName}</span>
          </div>
          <div className="h-px bg-zinc-850" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest">Date/Time</span>
            <span className="text-xs font-black text-zinc-200">{new Date(scheduledBooking.start).toLocaleString()}</span>
          </div>
          <div className="h-px bg-zinc-850" />
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-bold text-zinc-550 uppercase tracking-widest">Duration</span>
            <span className="text-xs font-black text-zinc-200">{scheduledBooking.duration} min</span>
          </div>
        </div>
        <button
          onClick={reset}
          className="w-full py-3.5 px-6 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-emerald-500/10"
        >
          Done
        </button>
      </div>
    )
  );
```

- [ ] **Step 5: Import `CalendarCheck`**

Add `CalendarCheck` to the `lucide-react` imports at the top of `TerminalKiosk.tsx`.

- [ ] **Step 6: Run existing kiosk-related tests**

Run: `npx vitest run src/lib/queue/queue-service.test.ts src/app/api/queue/route.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/components/terminal/TerminalKiosk.tsx
git commit -m "feat: add schedule success confirmation to kiosk"
```

---

### Task 3: Add rate limiting to booking APIs

**Files:**
- Modify: `src/app/api/bookings/route.ts`
- Modify: `src/app/api/queue/route.ts`
- Create: `src/lib/rate-limit.ts`
- Test: `src/app/api/bookings/route.test.ts`

- [ ] **Step 1: Write failing test for rate limiting**

In `src/app/api/bookings/route.test.ts`, add:

```ts
describe('POST /api/bookings rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 429 when same member books twice within 60 seconds', async () => {
    vi.mock('@/lib/rate-limit', () => ({
      checkRateLimit: vi.fn(() => false),
    }));

    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: new Date(Date.now() + 86400000).toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(429);
  });
});
```

Run: `npx vitest run src/app/api/bookings/route.test.ts -t "rate limit"`
Expected: FAIL

- [ ] **Step 2: Implement `src/lib/rate-limit.ts`**

```ts
const windows = new Map<string, number>();

export function checkRateLimit(key: string, cooldownMs = 60_000): boolean {
  const now = Date.now();
  const last = windows.get(key);
  if (last && now - last < cooldownMs) return false;
  windows.set(key, now);
  return true;
}
```

- [ ] **Step 3: Apply rate limiting in `/api/bookings`**

In `src/app/api/bookings/route.ts` POST handler, before creating booking:

```ts
const memberKey = body.memberId ?? user.id;
if (!checkRateLimit(`booking:${memberKey}`)) {
  return NextResponse.json({ error: 'Too many booking requests. Please wait 60 seconds.' }, { status: 429 });
}
```

- [ ] **Step 4: Apply rate limiting in `/api/queue`**

In `src/app/api/queue/route.ts` POST handler, after validation:

```ts
import { checkRateLimit } from '@/lib/rate-limit';

// After joinSchema parse
if (!checkRateLimit(`queue:${result.data.memberId}`)) {
  return NextResponse.json({ error: 'Too many requests. Please wait 60 seconds.' }, { status: 429 });
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/app/api/bookings/route.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/rate-limit.ts src/app/api/bookings/route.ts src/app/api/queue/route.ts src/app/api/bookings/route.test.ts
git commit -m "feat: add 60s rate limiting to booking APIs"
```

---

### Task 4: Add unit tests for extended queue service and booking engine

**Files:**
- Modify: `src/lib/queue/booking-engine.test.ts`
- Modify: `src/lib/queue/queue-service.test.ts`
- Test: `src/lib/queue/advanced-booking.test.ts`

- [ ] **Step 1: Add future-slot test to `booking-engine.test.ts`**

Add:

```ts
it('considers future Scheduled games as unavailable', async () => {
  const future = new Date(Date.now() + 86400000);
  const end = new Date(future.getTime() + 3600000);
  mockSupabase.from().select().then(() => Promise.resolve({ data: [{ id: 'g1', start_time: future.toISOString(), duration: 60, status: 'Scheduled' }], error: null }));
  const result = await isSlotAvailable('court-1', new Date(), end);
  expect(result).toBe(false);
});
```

- [ ] **Step 2: Add advanced booking test to `queue-service.test.ts`**

Add a test verifying that joining the queue with a future `start` returns a queue entry with `status: 'scheduled'` when no court is available.

- [ ] **Step 3: Add cancellation refund tests to `advanced-booking.test.ts`**

Add tests:
- Cancelling >2h before start refunds wallet
- Cancelling <2h before start does not refund
- Cancelling a `Scheduled` game uses correct status path

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/queue/booking-engine.test.ts src/lib/queue/queue-service.test.ts src/lib/queue/advanced-booking.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/queue/booking-engine.test.ts src/lib/queue/queue-service.test.ts src/lib/queue/advanced-booking.test.ts
git commit -m "test: extend queue and booking engine coverage for advanced booking"
```

---

### Task 5: Add full Playwright e2e coverage for advanced booking flows

**Files:**
- Modify: `tests/e2e/advanced-booking.spec.ts`

- [ ] **Step 1: Add authenticated booking flow test**

Because this environment lacks a logged-in session, add a test that exercises the flow via API setup + page assertions:

```ts
test('completes booking flow via API and shows confirmation', async ({ page }) => {
  await page.goto('/book');
  await page.fill('input[type="date"]', new Date(Date.now() + 86400000).toISOString().split('T')[0]);
  const courtBtn = page.locator('button:has-text("Court 1")').first();
  if (await courtBtn.count() > 0) {
    await courtBtn.click();
  }
  await page.selectOption('select:nth-of-type(2)', '60');
  await page.click('button:has-text("Confirm Booking")');
  await expect(page.locator('text=Booking Confirmed')).toBeVisible();
});
```

- [ ] **Step 2: Add kiosk schedule mode test**

```ts
test('kiosk schedule mode shows date/time screen', async ({ page }) => {
  await page.goto('/terminal?testmode=true');
  await page.fill('input[type="text"]', 'TEST001');
  await page.click('button:has-text("Go")');
  await expect(page.locator('text=How would you like to book?')).toBeVisible();
  await page.click('button:has-text("Schedule")');
  await expect(page.locator('text=Select Date & Time')).toBeVisible();
});
```

- [ ] **Step 3: Run Playwright**

Run: `npx playwright test tests/e2e/advanced-booking.spec.ts --config=playwright.config.ci.ts --project=chromium --reporter=list --timeout=120000`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/advanced-booking.spec.ts
git commit -m "test: add advanced booking e2e flows"
```

---

### Task 6: Verify `match_title` schema and seeding

**Files:**
- Inspect: `web/supabase/schema.sql`

- [ ] **Step 1: Confirm whether `match_title` exists in local schema**

If missing from `games` and `queue_entries`, add it to `web/supabase/schema.sql` as a nullable text column so local/dev matches production behavior.

- [ ] **Step 2: Commit any schema additions**

```bash
git add web/supabase/schema.sql
git commit -m "fix: add missing match_title column to schema"
```

---

## Summary

This plan closes the 8 identified gaps:
1. Price preview + booking confirmation on `/book`
2. Kiosk dedicated schedule-success screen
3. 60-second rate limiting on booking APIs
4. Extended unit tests for booking engine, queue service, and cancellation refunds
5. Full Playwright coverage for web and kiosk flows
6. Schema verification for `match_title`
