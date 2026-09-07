# Queue Management System — Design

## Context

The application has two parallel queue systems today: an in-memory store (`game-store.ts`) used by the terminal, and a Supabase-backed queue used by the admin dashboard. They are disconnected and hold separate state. The in-memory store is not persisted, cannot survive server restarts, and duplicates booking logic.

This spec replaces both with a single unified Supabase-backed queue system and retires `game-store.ts`.

## Philosophy

First-Come, First-Served. Players never manually choose a court — the booking engine assigns the best available court automatically. The implementation follows industry waitlist patterns (restaurant, bowling, karaoke) with minimal infrastructure.

## Schema

One new table only:

```sql
CREATE TABLE queue_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id       UUID NOT NULL REFERENCES members(id),
  requested_start TIMESTAMPTZ NOT NULL,
  duration        INTEGER NOT NULL CHECK (duration IN (30, 60, 90)),
  party_size      INTEGER NOT NULL CHECK (party_size IN (2, 4)),
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
```

No separate `reservation_offers` table — the `offered` status + `expires_at` handles temporary reservations.

## Services

All in `src/lib/queue/`. Single responsibility, no duplication.

### `booking-engine.ts`

Reusable court availability checker. Used by both direct booking and queue processing.

- `findAvailableCourt(requestedStart: Date, duration: number, partySize: number): CourtInfo | null`
  - Queries `games` for overlapping bookings (conflict rule: `requestedStart < existingEnd AND requestedEnd > existingStart`)
  - Returns the first compatible court, or `null` if none available
  - Accepts optional `excludeCourtId` for re-checking the same court after a decline
- `isSlotAvailable(courtId: string, start: Date, end: Date): boolean`
  - Pure check, no side effects
- `findBestCourt(start: Date, end: Date, partySize: number): CourtInfo | null`
  - Same as `findAvailableCourt` but picks least-fragmented schedule; defaults to first available for now

Conflict rule is defined once and reused everywhere.

### `queue-service.ts`

- `joinQueue(memberId: string, start: Date, duration: number, partySize: number): QueueEntry`
  - Validates: member is active, no overlapping booking, no duplicate waiting entry, no court available now
  - If a court IS available, call booking engine directly (skip the queue)
  - Otherwise INSERT `queue_entries` with `status: 'waiting'`
  - Returns the queue entry
- `leaveQueue(entryId: string): void`
  - Sets status to `cancelled`
- `getQueuePosition(memberId: string): number`
  - COUNT of `waiting` entries with `created_at < this entry's created_at`
- `getEstimatedWait(position: number): string`
  - `position * avgGameDuration` — avgGameDuration derived from `settings.prices` or hardcoded 60min default — informational only
- `getQueueState(): { waiting: number, offers: QueueEntry[] }`
  - Snapshot for admin dashboard

### `queue-processor.ts`

- `processCourt(courtId: string): Promise<void>`
  - Called when a court becomes available (game ends, someone declines, someone expires, admin releases)
  - Finds next `waiting` entry compatible with that court's schedule
  - Updates to `status: 'offered'`, sets `expires_at = NOW() + interval '5 minutes'`, sets `court_id`
  - Publishes MQTT display update via existing `publishDisplay()`
  - Supabase Realtime automatically pushes the change to the terminal
  - If no compatible waiting entry, publishes "Court Available" to MQTT display
- `processExpiredOffers(): Promise<void>`
  - Called on server startup and every 30s via `setInterval` to expire `offered` entries past `expires_at`
  - For each expired entry: set `status: 'expired'`, call `processCourt(courtId)`
  - Runs only once even if called multiple times (guard flag)

### `reservation-service.ts`

- `acceptOffer(entryId: string): Promise<{ success: boolean; error?: string }>`
  - Re-validates: member active, sufficient wallet balance, court slot still free
  - Calls `register_game` RPC (atomic wallet debit + game + players)
  - Updates queue entry to `status: 'completed'`
  - Publishes MQTT display with booking confirmation + countdown
  - On insufficient balance: mark `insufficient_credits`, notify, call `processCourt(courtId)`
- `declineOffer(entryId: string): Promise<void>`
  - Sets `status: 'declined'`
  - Calls `processCourt(courtId)` for the next player
- `expireOffer(entryId: string): Promise<void>`
  - Same as decline but `status: 'expired'`

`partySize` maps to match type: 2 = 1v1 (singles), 4 = 2v2 (doubles). This is used when calling `register_game` RPC.

## Real-Time Updates

### Terminal UI — Supabase Realtime

The terminal page subscribes to `queue_entries` changes relevant to the logged-in member:

```ts
supabase.channel('queue')
  .on('postgres_changes',
    { event: '*', schema: 'public', table: 'queue_entries',
      filter: `member_id=eq.${memberId}` },
    (payload) => { /* update UI */ }
  )
  .subscribe()
```

This pushes queue position, reservation offers, expiry countdowns, and confirmations instantly — no polling.

### IoT Controllers — MQTT via HiveMQ

Existing `publishDisplay()` in `src/lib/mqtt.ts` is called by `queue-processor.ts` and `reservation-service.ts` to update physical court displays:

- Court becomes available → display shows "Court Available"
- Reservation offered → display shows player names + countdown
- Booking confirmed → display shows players + game timer

## Terminal Integration

The terminal (`src/app/terminal/page.tsx`) gets rebuilt around the new flow:

1. **Scan RFID** → member lookup (unchanged, uses `/api/controller/member/[rfid]`)
2. **Pick duration + party size** → booking engine checks availability
   - Available → immediately show confirmation (skip queue)
   - Unavailable → offer to join queue
3. **Queue status** → live Realtime subscription shows position + estimated wait
4. **Reservation offered** → inline accept/decline with countdown timer
5. **Confirmed** → success screen with court name, time, credits used, remaining

The `'court'` and `'match'` selection steps are removed (players don't pick courts or match types — the engine assigns the best court; party size implies 1v1 or 2v2).

## Admin Integration

The existing `QueuePanel` component gets extended:

- Filter by status
- Manual assign (force-offer a specific court)
- Remove/cancel entries
- Extend reservation timeout
- Audit log for admin actions (reuses `audit_logs` table)

## Booking Conflict Rule

Single function, reused everywhere:

```ts
function isOverlapping(
  requestedStart: Date, requestedEnd: Date,
  existingStart: Date, existingEnd: Date
): boolean {
  return requestedStart < existingEnd && requestedEnd > existingStart;
}
```

## Edge Cases

| Case | Handling |
|---|---|
| Duplicate join request | Unique constraint on `(member_id, status)` where `status = 'waiting'` — or application-level check |
| Member has overlapping booking | `joinQueue` rejects with `'Already booked for this time slot'` |
| Court becomes unavailable after offer | `acceptOffer` re-checks `isSlotAvailable`; if taken, offer new court or re-queue |
| Insufficient credits on accept | Mark `insufficient_credits`, notify, process next in queue |
| Multiple courts free simultaneously | `processCourt` is called per-court; each finds best match independently |
| Race condition on accept | `register_game` RPC is transactional; wallet debit + game creation are atomic |
| Server restart | All queue state is persisted in Supabase; `processExpiredOffers` runs on startup |
| Network interruption | Realtime subscriptions auto-reconnect; MQTT client reconnects via existing reconnect logic |

## Files to Create

| File | Contents |
|---|---|
| `src/lib/queue/booking-engine.ts` | `findAvailableCourt`, `isSlotAvailable`, `findBestCourt`, `isOverlapping` |
| `src/lib/queue/queue-service.ts` | `joinQueue`, `leaveQueue`, `getQueuePosition`, `getEstimatedWait`, `getQueueState` |
| `src/lib/queue/queue-processor.ts` | `processCourt`, `processExpiredOffers` |
| `src/lib/queue/reservation-service.ts` | `acceptOffer`, `declineOffer`, `expireOffer` |
| `src/lib/queue/index.ts` | Barrel exports |
| `src/lib/queue/booking-engine.test.ts` | Unit tests |
| `src/lib/queue/queue-service.test.ts` | Unit tests |
| `src/lib/queue/queue-processor.test.ts` | Unit tests |
| `src/lib/queue/reservation-service.test.ts` | Unit tests |

## Files to Modify

| File | Changes |
|---|---|
| `supabase/schema.sql` | Add `queue_entries` table |
| `src/app/terminal/page.tsx` | Rebuild around new flow (no court selection, realtime queue, offer accept/decline) |
| `src/components/courts/QueuePanel.tsx` | Extend with admin actions (force assign, extend, remove) |
| `src/app/api/queue/route.ts` | Use new queue service instead of raw Supabase queries |
| `src/app/api/queue/[id]/route.ts` | Use reservation service for PATCH accept/decline |

## Files to Delete

| File | Reason |
|---|---|
| `src/lib/game-store.ts` | Replaced by Supabase-backed queue services |
| `src/app/api/public/courts/route.ts` | Replaced by booking engine |
| `src/app/api/public/players/route.ts` | Test data, no longer needed |
| `src/app/api/public/rfid/[uid]/route.ts` | Replaced by `/api/controller/member/[rfid]` |
| `src/app/api/public/queue/route.ts` | Replaced by new queue API |
| `src/app/api/public/game/start/route.ts` | Replaced by queue processor |
| `src/app/api/public/game/end/route.ts` | Replaced by queue processor |

## Non-Goals

- No SMS/email/push notification integration — the provider-agnostic notification interface is designed but not implemented
- No queuing algorithm customization — FCFS only
- No auto-generated `memberId` — still manually entered by staff
- No changes to RFID authentication, voucher authentication, or member account CRUD
