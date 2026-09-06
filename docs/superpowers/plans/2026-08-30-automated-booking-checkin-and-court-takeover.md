# Automated Booking Check-in and Court Takeover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make scheduled bookings, paid guest references, RFID member check-in, early court takeover, no-shows, queue promotion, and device displays follow one automated and concurrency-safe policy across the web app, Supabase, kiosk terminal, and LED displays.

**Architecture:** Supabase remains the source of truth. The web API owns all booking transitions and computes the effective end time: a normal play-now booking uses an allowed duration, while a takeover is capped at the next confirmed reservation start. Members check in with RFID; non-members check in by entering a payment-confirmed booking reference on the touchscreen. A minute reconciliation job handles missed events and no-shows, while every mutation immediately republishes the board and court display payloads.

**Tech Stack:** Next.js App Router, TypeScript, Supabase PostgreSQL/RLS/RPC, Vitest, React terminal UI, ESP32-S3 C/LVGL kiosk firmware, MQTT, ESP32 HUB75 LED display firmware, CMake/PlatformIO simulation.

---

## Policy decisions to encode

- A confirmed scheduled booking protects its start time and is never silently replaced by the queue.
- A member may tap RFID to request `Play Now`; the server may approve it only if the court is free and the selected session ends before the next confirmed booking.
- If a future booking starts at 3:00 PM and the court opens at 2:15 PM, the takeover may run from 2:15 PM to 3:00 PM. Its effective duration is 45 minutes even though normal duration choices are configured values such as 30/60/90/120.
- If no future confirmed booking exists, `Play Now` uses one configured duration and has no reservation cutoff.
- A guest request receives a reference immediately, but the reference is unusable until staff confirms external payment. Walk-in means cash.
- Members use RFID for check-in. Guests use touchscreen reference entry because the terminal has no camera.
- Check-in opens 15 minutes before a booking and has a 10-minute grace period after start. A booking with no check-in becomes `No-show`; the next eligible queue entry can then be promoted.
- A pending guest request does not block a court. A confirmed/paid guest booking does block its reserved interval.
- A player cannot extend a takeover into a confirmed booking, and a player cannot use one booking to create two active games.
- Admin actions remain available for exceptions: confirm/reject payment, cancel, reschedule, start, mark no-show, end, end-and-refund, and requeue.

## File map

- Create one Supabase migration under `web/supabase/migrations/` for booking check-in/no-show/takeover metadata, constraints, indexes, and RPC transitions.
- Modify `web/src/lib/queue/queue-service.ts`, `web/src/lib/queue/queue-processor.ts`, `web/src/lib/queue/booking-engine.ts`, and `web/src/lib/queue/advanced-booking.ts` for server-side policy enforcement.
- Modify `web/src/app/api/queue/route.ts`, `web/src/app/api/queue/[id]/route.ts`, and create a guest check-in route under `web/src/app/api/guest-booking-requests/check-in/route.ts`.
- Modify `web/src/app/api/guest-booking-requests/[id]/route.ts` and `web/src/components/bookings/GuestBookingRequestsPanel.tsx` so payment confirmation is the gate that activates the guest reference.
- Modify `web/src/features/courts/actions/index.ts`, `web/src/components/courts/GameActions.tsx`, `web/src/components/terminal/TerminalKiosk.tsx`, and related terminal booking components for explicit check-in/takeover/no-show UX.
- Modify `web/src/lib/queue/board-snapshot.ts`, `web/src/lib/display/publish-all.ts`, and `web/src/lib/display/sports-caster.ts` for `Reserved`, `Checking in`, `No-show`, and capped-session display state.
- Modify `kiosk-terminal/src/data/kiosk_model.h`, `kiosk-terminal/src/data/live/live_data_provider.c`, `kiosk-terminal/src/net/freq_rest_client.c`, and `kiosk-terminal/src/ui/` screens/widgets for RFID play-now and guest reference entry.
- Modify `display-firmware/src/MqttDisplayClient.cpp` and `display-firmware/src/MqttDisplayClient.h` when the display payload state contract changes; retain local schedule expiry as the offline safety net.
- Add/extend Vitest tests in `web/src/lib/queue/`, `web/src/app/api/`, `web/src/features/courts/`, and `web/src/lib/display/`; extend `tests/virtual-venue/`, kiosk simulator tests, and firmware contract tests.

### Task 1: Lock the state machine and database invariants

**Files:**
- Create: migration generated in `web/supabase/migrations/` using the repository’s Supabase CLI workflow.
- Test: `web/src/lib/queue/booking-state.test.ts`.
- Test: `web/src/lib/queue/simulation.test.ts`.

- [ ] **Step 1: Write failing state-transition tests.** Cover `Pending Confirmation → Confirmed`, `Confirmed → Checked In`, `Checked In → In Progress`, `Confirmed → No-show`, `In Progress → Completed`, `Cancelled`, and `Requeued`. Assert that a guest reference is rejected before payment confirmation and accepted after it.
- [ ] **Step 2: Define database fields and constraints.** Add explicit fields for `check_in_at`, `no_show_at`, `reserved_until`, `booking_source`, and a non-secret guest check-in token/reference association. Add indexes for `(court_id, status, start_time)`, `(status, start_time)`, and guest reference lookup. Use existing status spelling consistently rather than introducing multiple variants.
- [ ] **Step 3: Add transactional RPCs.** Create RPCs for `check_in_booking`, `start_play_now`, `mark_no_show`, and `promote_next_queue_entry`. Each RPC must lock the relevant court and booking rows, verify payment/status/ownership, enforce the cutoff, and return the authoritative game/court state. Do not use a public `SECURITY DEFINER` function without restricted grants and an explicit authorization check.
- [ ] **Step 4: Verify on Supabase.** Apply the migration through the repository’s Supabase MCP/CLI workflow, run the migration/security checks, and execute read-only queries proving the indexes, constraints, and transition behavior.
- [ ] **Step 5: Commit the database contract.** Commit only the migration and state-transition tests with `feat: add automated booking state contract`.

### Task 2: Implement the web booking engine and reconciliation rules

**Files:**
- Modify: `web/src/lib/queue/booking-engine.ts`.
- Modify: `web/src/lib/queue/advanced-booking.ts`.
- Modify: `web/src/lib/queue/queue-service.ts`.
- Modify: `web/src/lib/queue/queue-processor.ts`.
- Test: `web/src/lib/queue/booking-engine.test.ts`.
- Test: `web/src/lib/queue/simulation.test.ts`.

- [ ] **Step 1: Add failing takeover tests.** Test no future booking, a future booking with enough time for a configured duration, a future booking with only a 45-minute gap, no duration fitting the gap, an overlapping confirmed guest booking, and concurrent RFID taps.
- [ ] **Step 2: Centralize effective end-time calculation.** Add a pure function with this contract:

```ts
type CourtWindow = { startsAt: Date; endsAt: Date; reason: 'standard' | 'reservation-cutoff' };
function getPlayNowWindow(now: Date, requestedDuration: number, nextReservedStart: Date | null): CourtWindow | null;
```

It must reject invalid configured durations, use `now + requestedDuration` when there is no reservation, and use `nextReservedStart` as the hard end when the reservation is sooner. It must reject a non-positive window and never return an end after the reservation.
- [ ] **Step 3: Make all court selection use the requested interval.** Keep `findAvailableCourt` and `isSlotAvailable` aligned with the requested start/end, including future scheduled guest and member games.
- [ ] **Step 4: Update reconciliation.** Expire finished games, preserve future confirmed reservations, mark missed reservations `No-show` only after the grace period, then promote the oldest eligible queue entry. Skip inactive/suspended members and entries that cannot fit before the next reservation. Republish after every state-changing reconciliation.
- [ ] **Step 5: Make promotion idempotent.** Use conditional status updates/transactions so two cron invocations or two kiosks cannot create duplicate games, charges, or queue claims.
- [ ] **Step 6: Run the focused tests.** Run `npm test -- --run src/lib/queue/booking-engine.test.ts src/lib/queue/simulation.test.ts`; expected: all pass, including the 2:15–3:00 capped takeover scenario.
- [ ] **Step 7: Commit the queue engine.** Commit with `feat: automate court windows and queue promotion`.

### Task 3: Implement guest payment confirmation and reference check-in

**Files:**
- Modify: `web/src/app/api/guest-booking-requests/route.ts`.
- Modify: `web/src/app/api/guest-booking-requests/[id]/route.ts`.
- Create: `web/src/app/api/guest-booking-requests/check-in/route.ts`.
- Modify: `web/src/lib/validation/api-schemas.ts`.
- Modify: `web/src/components/bookings/GuestBookingRequestsPanel.tsx`.
- Test: `web/src/app/api/guest-booking-requests/route.test.ts`.
- Test: `web/src/app/api/guest-booking-requests/[id]/route.test.ts`.
- Test: `web/src/app/api/guest-booking-requests/check-in/route.test.ts`.

- [ ] **Step 1: Test the payment gate.** Assert that a newly created request is `Pending Confirmation`, its reference cannot check in, `Walk-in` is treated as cash, and a staff-confirmed request becomes `Confirmed` with `payment_status = Confirmed` and a scheduled game.
- [ ] **Step 2: Add the check-in endpoint.** Accept a normalized reference, look up only a confirmed/paid guest booking, enforce the check-in window, atomically set `check_in_at`, and return the booking/court/start/end state. Return the same safe error for unknown, pending, cancelled, expired, and already-used references without leaking booking details.
- [ ] **Step 3: Make confirmation transactional.** Ensure staff payment confirmation cannot create a scheduled game if the requested interval became unavailable, and cannot leave a confirmed request without a game. Make repeated confirmation idempotent.
- [ ] **Step 4: Update admin UI.** Require an explicit payment method/status when confirming. Show the reference, payment state, reserved court/time, and whether it is checked in/no-show. Add cancel/reschedule/no-show actions where existing admin patterns support them.
- [ ] **Step 5: Run API tests and commit.** Run the three focused test files and commit with `feat: gate guest check-in on payment confirmation`.

### Task 4: Add member RFID check-in and play-now takeover to the web terminal

**Files:**
- Modify: `web/src/app/api/queue/route.ts`.
- Modify: `web/src/app/api/queue/[id]/route.ts`.
- Create or modify: `web/src/app/api/terminal/member/[rfid]/route.ts`.
- Modify: `web/src/components/terminal/TerminalKiosk.tsx`.
- Modify: `web/src/components/terminal/CourtOverview.tsx` and `web/src/components/terminal/CourtStatusCard.tsx`.
- Test: `web/src/components/terminal/GuidedBookingWizard.test.tsx`.
- Test: `web/src/app/api/queue/route.test.ts`, `web/src/app/api/queue/[id]/route.test.ts`, and `web/src/app/api/terminal/member/[rfid]/route.test.ts`.

- [ ] **Step 1: Test RFID decisions.** Cover active member with no reservation, member with the next reservation, member with an existing queue entry, inactive/suspended member, court with a 45-minute gap, and simultaneous scans.
- [ ] **Step 2: Add a server-owned RFID decision endpoint.** Return one of `check-in scheduled`, `play now`, `already active`, `already queued`, `no eligible window`, or `member unavailable`. Never trust the client’s duration/court cutoff; calculate it on the server.
- [ ] **Step 3: Add the minimal UI flow.** After RFID lookup, show the member’s next booking and a single `Play Now` action when permitted. Show the computed end time and reservation cutoff. Do not show arbitrary duration choices when a reservation cutoff applies.
- [ ] **Step 4: Preserve queue fairness.** Prevent a member from using `Play Now` to bypass an earlier eligible queue entry unless they are the confirmed reservation holder or the venue policy explicitly allows it.
- [ ] **Step 5: Verify mobile and test mode.** Run the terminal component tests and Playwright/API test-mode flows for normal booking, capped takeover, no eligible window, and duplicate tap.

### Task 5: Update the physical kiosk terminal

**Files:**
- Modify: `kiosk-terminal/src/net/freq_rest_client.h`.
- Modify: `kiosk-terminal/src/net/freq_rest_client.c`.
- Modify: `kiosk-terminal/src/data/kiosk_model.h`.
- Modify: `kiosk-terminal/src/data/live/live_data_provider.c`.
- Modify: `kiosk-terminal/src/ui/ui_app.c`.
- Create: `kiosk-terminal/src/ui/screens/guest_checkin.c` and `kiosk-terminal/src/ui/screens/guest_checkin.h`.
- Create: `kiosk-terminal/src/ui/screens/play_now.c` and `kiosk-terminal/src/ui/screens/play_now.h`.
- Test: `kiosk-terminal/tests/` plus `tests/static_keyboard_contract.sh` and `tests/keyboard_geometry_contract.sh`.

- [ ] **Step 1: Extend the model.** Add bounded fields for booking reference, check-in result, reservation cutoff, and effective duration. Keep all strings length-limited for ESP32 memory safety.
- [ ] **Step 2: Add REST calls.** Implement guest reference check-in and RFID play-now calls with explicit HTTP status mapping for pending payment, invalid reference, no-show, no eligible window, duplicate request, and network failure.
- [ ] **Step 3: Add touchscreen flows.** Add `Check in booking` to the idle flow, a numeric reference keypad, confirmation summary with court/start/end, and a clear retry/back action. After RFID, show `Play now until HH:MM` when capped and `Play now for N minutes` when uncapped.
- [ ] **Step 4: Handle stale board data.** Refresh the board before submitting a play-now request and show the server’s authoritative result. Reset the form after success, timeout, cancellation, or a second RFID scan.
- [ ] **Step 5: Verify simulator behavior.** Run the simulator through normal play-now, capped takeover, scheduled guest reference before payment, confirmed guest reference, duplicate scan, inactive member, and API timeout scenarios. Run the existing simulator build command and commit with `feat: support automated kiosk check-in flows`.

### Task 6: Update LED display state and payloads

**Files:**
- Modify: `web/src/lib/queue/board-snapshot.ts`.
- Modify: `web/src/lib/display/publish-all.ts`.
- Modify: `web/src/lib/display/sports-caster.ts`.
- Modify: `display-firmware/src/MqttDisplayClient.cpp` and `display-firmware/src/MqttDisplayClient.h` to parse and apply the display state fields defined in this plan.
- Test: `web/src/lib/queue/board-snapshot.test.ts`.
- Test: `web/src/lib/display/sports-caster.test.ts`.
- Test: `tests/virtual-venue/virtual-venue.test.mjs`.
- Test: display firmware parser/contract scripts.

- [ ] **Step 1: Add payload tests.** Assert that future reservations are not `PLAYING`, expired games are not retained, reserved courts show the next booking, capped games end at the reservation boundary, and idle payloads are published after no-show/cancellation.
- [ ] **Step 2: Define display states.** Use the existing payload model where possible; add only the smallest explicit state needed for `OPEN`, `RESERVED`, `CHECK-IN`, `PLAYING`, `NO-SHOW`, and `MAINTENANCE`. Include server epoch and block end epoch for offline local expiry.
- [ ] **Step 3: Keep firmware dumb.** The firmware must select blocks by server/local epoch and fall back to idle; it must not decide queue priority, payment, no-show, or promotion. Ensure a newly retained MQTT payload replaces old blocks completely.
- [ ] **Step 4: Verify the virtual venue.** Publish state transitions through the retained MQTT bus and assert both web board consumers and the LED consumer converge on the same current/reserved/idle state.
- [ ] **Step 5: Compile firmware.** Run `cd display-firmware && pio run -e esp32-hub75-wf2`; expected: successful build with no changes to the DMA/Wi-Fi initialization ordering.

### Task 7: Reconciliation, failure recovery, and end-to-end scenario matrix

**Files:**
- Modify: `web/src/app/api/queue/advance/route.ts` to invoke the idempotent reconciliation contract and publish the resulting board/display state.
- Modify: `vercel.json` to retain the one-minute `/api/queue/advance` cron declaration.
- Modify: `tests/virtual-venue/virtual-venue.mjs` and `tests/virtual-venue/virtual-venue.test.mjs`.
- Create: `tests/booking-policy/booking-policy.e2e.mjs`.
- Test: `web/src/lib/queue/simulation.test.ts`.

- [ ] **Step 1: Build the complete matrix.** Test: no schedule/open court; no schedule with queue; future member reservation; future paid guest reservation; pending guest request; early end with 45-minute gap; no duration fits; member takeover; guest check-in by reference; invalid/unpaid reference; cancellation; no-show after grace; inactive/suspended next member; simultaneous taps; terminal offline; MQTT retained payload delay; admin end-and-refund; reschedule; and maintenance court.
- [ ] **Step 2: Test cron idempotency.** Run reconciliation twice against the same state and assert one completion, one promotion, one charge, and one MQTT publication state—not duplicate games.
- [ ] **Step 3: Test cross-platform convergence.** Drive each scenario through the web service simulation, then feed the resulting board/display payload to the kiosk parser and LED parser. Assert the same court phase, active game ID, reservation cutoff, and queue state.
- [ ] **Step 4: Run all verification commands.** Run `cd web && npm test -- --run`, `npm run build`, `git diff --check`, the repository shell contracts, the kiosk simulator build/run, and `cd display-firmware && pio run -e esp32-hub75-wf2`.
- [ ] **Step 5: Deploy and smoke test.** Confirm `CRON_SECRET` remains configured, deploy through the linked Vercel project, verify the deployment reaches `READY`, confirm unauthenticated `/api/queue/advance` returns `401`, and use test mode to verify the public terminal paths without creating uncontrolled production bookings.
- [ ] **Step 6: Commit and document operations.** Commit the complete tested implementation with `feat: automate booking check-in and court takeover`, update `web/README.md` and the root `README.md` with the policy, and record the production deployment URL and verification results.

## Self-review checklist

- The plan covers payment-confirmed guest references, cash walk-ins, RFID members, no camera, scheduled reservations, early takeover, exact reservation cutoffs, no-shows, queue fairness, admin exceptions, web API, Supabase, kiosk firmware, LED firmware, and tests.
- The 45-minute takeover is explicitly modeled as a server-capped effective session, not as an unsupported arbitrary duration choice.
- No device computes business rules; all promotion, payment, check-in, and cutoff decisions remain server/database-owned.
- The plan requires migration verification, RLS/security review, idempotency tests, device simulation, full builds, and deployment smoke checks.
