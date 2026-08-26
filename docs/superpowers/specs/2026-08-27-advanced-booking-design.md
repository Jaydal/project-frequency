# Advanced Booking — Design Spec

## 1. Goal

Allow members and admins to book courts for future times (up to 7 days ahead) from the public website, kiosk, and admin dashboard, while keeping the existing immediate-join queue behavior intact.

## 2. Data Model

### Existing fields reused

- `queue_entries.requested_start` — already present; now used for future booking start times
- `queue_entries.deposit_tx_id` — already present; wallet deduction happens immediately on booking
- `queue_entries.match_title` — used by existing code; missing from `schema.sql` but assumed present in production DB
- `games.status` — already supports `'Scheduled'`

### Status values

`queue_entries`:
- `waiting`
- `offered`
- `completed`
- `cancelled`
- `expired`
- `declined`
- `scheduled` — new; entry exists for a future booking that has not started yet

`games`:
- `Scheduled` — future booking confirmed, court reserved
- `In Progress` — booking has started
- `Completed` — booking ended
- `Cancelled` — booking cancelled before start

### Booking rules

- Max advance window: **7 days**
- Allowed durations: **30, 60, 90 minutes** (from `settings.products`)
- Wallet must have sufficient balance at creation time
- Cancellation refund policy: **full refund if cancelled more than 2 hours before start**; **no refund if within 2 hours of start**
- A member may have **one active booking** at a time (existing or future)
- Admin can override the one-active-booking limit

## 3. API

### New endpoints

`POST /api/bookings`
- Creates an advanced booking
- Auth required for web/admin; kiosk uses existing member lookup
- Body:
  - `memberId` (uuid)
  - `courtId?` (optional; if omitted, system picks first available court)
  - `start` (ISO datetime, must be > now and <= now + 7 days)
  - `duration` (30|60|90)
  - `partySize` (2|4)
  - `playerIds[]` (uuids, min 1, max 4)
  - `matchTitle?` (optional string)
- Behavior:
  - Validates inputs and slot availability
  - If court is free at requested time: creates `games` row with `status = 'Scheduled'`
  - If court is busy: creates `queue_entries` row with `status = 'scheduled'` for later processing
  - Deducts wallet immediately via `deductWallet`
  - Returns created booking with court/status info

`GET /api/bookings`
- Returns upcoming bookings
- Query params:
  - `memberId` — returns bookings for that member
  - `date?` — filters to a specific date (YYYY-MM-DD)
- Admin can omit `memberId` to see all bookings

`PATCH /api/bookings/[id]`
- Cancels a booking
- Body: `{ action: 'cancel' }`
- Refunds wallet if >2h before start; otherwise cancels without refund
- Updates `queue_entries` or `games` status to `cancelled`

`GET /api/bookings/availability`
- Returns time-slot availability for a court/date
- Query params: `courtId`, `date` (YYYY-MM-DD)
- Response: array of 30-min slots with `time`, `available` (boolean), `status`

### Modified endpoints

`POST /api/queue`
- Accepts `start` in the future
- If `start > now`: creates `queue_entries` with `status = 'scheduled'` or `games` with `status = 'Scheduled'`
- If `start <= now`: existing immediate join behavior

`queue-processor.ts`
- Already promotes `Scheduled` → `In Progress` when `start_time <= now`
- Must also handle `queue_entries.status = 'scheduled'` similarly to `waiting`

## 4. Public Web UI

### New pages

`/book`
- Public booking page
- Browsing is public; booking requires login
- Layout:
  - Court selector (grid of available courts for chosen date)
  - Date picker (max 7 days ahead, operating hours from `settings.operatingHours`)
  - Time slot grid (30-min increments within operating hours)
  - Duration selector
  - Game type selector (`1v1`/`2v2`)
  - Match title (optional)
  - Price preview
  - Confirm button
- If user is not authenticated and clicks Confirm: redirect to `/login?redirect=/book`
- After booking: show confirmation with court, date, time, booking ID

`/bookings`
- Member’s booking history and upcoming bookings
- Requires login
- Shows list of active/future bookings with cancel button
- Cancellation enforces 2-hour rule client-side before calling API

`/login`
- Existing login page
- Supports `?redirect=` query param

### New components

- `CourtGrid` — court cards for selected date, showing availability indicators
- `TimeSlotGrid` — clickable 30-min slots, color-coded (available/booked/partial)
- `BookingCard` — booking detail with cancel action
- `BookingConfirmation` — success screen after booking

## 5. Kiosk Enhancements

### Modified `TerminalKiosk.tsx`

After RFID scan, if member has no active queue entry, show a mode selector:
- **“Play Now”** — existing immediate queue flow
- **“Schedule”** — new flow:
  - Date picker (max 7 days ahead)
  - Time slot grid (30-min increments)
  - Court selection
  - Duration and game type selectors
  - Confirm with wallet deduction
  - Show booking confirmation with date/time/court

Wallet deduction happens immediately on confirm, same as existing queue deposit.

## 6. Admin Dashboard

### Modified `/dashboard/schedules/page.tsx`

Replace placeholder with:
- Calendar view of all upcoming bookings
- Admin can create bookings on behalf of any member
- Admin can cancel any booking (with optional refund override)
- Color-coded by status: Scheduled, In Progress, Completed, Cancelled
- Filters by date, court, member

## 7. Auth & Security

- `/book` — public browse; booking action requires Supabase auth session
- `/bookings` — requires auth; shows only current member’s bookings
- `/api/bookings` — web routes check `getUser()`; kiosk bypasses auth via existing RFID member lookup
- `/dashboard/*` — already protected by middleware
- Rate limiting: one booking creation per member per 60 seconds (API-level guard)

## 8. Testing

### Unit tests (Vitest)

- `src/lib/queue/booking-engine.test.ts` — add cases for future slot availability, 7-day window enforcement
- `src/lib/queue/queue-service.test.ts` — add cases for advanced booking creation, wallet deduction, cancellation refund logic
- New: `src/lib/queue/advanced-booking.test.ts` — focused tests for the new booking flow

### E2E tests (Playwright)

`tests/e2e/advanced-booking.spec.ts`
1. Member logs in, browses `/book`, selects court/date/time, confirms booking
2. Member views booking on `/bookings`, cancels it
3. Admin views all bookings on `/dashboard/schedules`
4. Kiosk mode: RFID scan → schedule mode → confirm booking

## 9. Implementation Order

1. API layer: new `/api/bookings/*` routes + extend `/api/queue`
2. Queue service: advanced booking creation + cancellation with refund logic
3. Queue processor: handle `scheduled` entries
4. Public web pages: `/book`, `/bookings`, components
5. Kiosk: schedule mode in `TerminalKiosk.tsx`
6. Admin dashboard: `/dashboard/schedules/page.tsx`
7. Tests: unit + Playwright
8. Polish: loading states, error messages, redirects
