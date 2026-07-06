# Terminal Queue + Booking Redesign

## Context

The existing `/terminal` page is a step-by-step booking kiosk (RFID scan → players → duration → confirm) with a sidebar showing ongoing games and queue. It works but has two problems:

1. **No public queue display** — there's no screen that shows the live waiting list and court status for bystanders to see
2. **Booking and queue are mixed** — the page does everything at once, making it harder to optimize for either purpose

This spec replaces `/terminal` with a single page at `/terminal/queue` that serves both purposes: a live queue status board (public display) with a "BOOK NOW" button that opens the booking flow as a modal overlay.

## Layout

7" landscape touchscreen (target 1024x600). Two-column layout:

```
┌──────────────────────────────────────────────────┐
│ [BOOK NOW 📝]              pickleball courts     │
├────────────────────┬─────────────────────────────┤
│                    │  🎯 NOW SERVING              │
│  COURT STATUS      │  Ana + Juan                  │
│                    │  Court 1 · 60 min             │
│ 🟢 Court 1         │  ⏱ 03:45 to accept           │
│    15:32 elapsed   ├─────────────────────────────┤
│ 🟢 Court 2         │  QUEUE (4 waiting)            │
│    05:10 elapsed   │                              │
│ 🟢 Court 3         │  #1  Jose R.   2v2  ~60 min  │
│    Available       │  #2  Maria S.  1v1  ~2 hrs   │
│ 🟢 Court 4         │  #3  Pedro P.  2v2  ~2 hrs   │
│    Available       │  #4  Ana G.    2v2  ~3 hrs   │
└────────────────────┴─────────────────────────────┘
```

### Header

- Left: Green "BOOK NOW" button (80px+ tall, pill shape)
- Right: Court branding text

### Court Status Panel (left column, ~50% width)

Four court cards stacked vertically. Each card shows:

- **In Progress:** Court name, elapsed timer (MM:SS), progress bar (filled proportionally to game duration), player names below
- **Available:** Court name, "Available" badge in green
- **Reserved/Offered:** Court name, "Reserved" badge in yellow

Cards update in real-time via Supabase Realtime subscription on `games` table. Active cards use a green left border accent. Available cards use a gray border.

### Now Serving (right top, ~35% height)

Highlights the current reservation offer:

- Player names (first only, large font)
- Court name + duration
- Countdown timer (MM:SS, red when < 60s)
- "Accepting at terminal" sub-label

If multiple offers are active simultaneously, show the one closest to expiry (most urgent). When no active offer, show a subdued "No active offers — next court frees at ~XX:XX" based on the earliest finishing game.

### Queue List (right bottom, ~65% height)

Ordered list of waiting entries, each row showing:

- Position number (bold, large, in a colored circle: gold for #1, gray for others)
- Player first name + last initial
- Party size badge (2 or 4)
- Duration
- Estimated wait

Rows are compact (~48px each). If the list exceeds visible space, the container scrolls naturally (no custom scrollbar needed). Updates via Realtime subscription on `queue_entries` where `status = 'waiting'`.

## Booking Flow (Modal Overlay)

Tapping "BOOK NOW" opens a centered modal overlay covering ~80% of the screen width. The queue board is visible behind it (dimmed).

### Steps:

1. **Scan (Test Mode) or RFID**
   - Test mode: grid of test player buttons (same as current page)
   - Production: RFID input with auto-submit on scan

2. **Players**
   - List of scanned players with remove button
   - "Add Player" button to scan more
   - Visual indicator of count: "2 of 4 players"

3. **Duration**
   - Three large tiles: 30, 60, 90 minutes
   - Each shows price per player below
   - Party size is implicit from player count (2 players = 1v1, 3-4 = 2v2)
   - Tapping a tile submits immediately (skips confirm step to reduce taps)

4. **Result**
   - **Immediate booking:** Green success card with court name, duration, credits used
   - **Queued:** Yellow card with position and estimated wait
   - "Close" button returns to queue board

5. **Offer detection**
   - If the player has an active offer (`status = 'offered'`) when they scan, skip to an "Offer" step showing accept/decline with countdown
   - Accept redirects to success, decline returns to queue board

### Modal design constraints:
- Backdrop dims the queue board behind
- Modal has a visible "X" close button (top-right)
- Each step is a single view within the modal (no page navigation within the page)
- Touch targets ≥ 56px throughout
- Test mode toggle via `?testmode=true` query param

## Data Sources

All subscriptions use `createClient()` from `@/lib/supabase/client` for browser-side Realtime:

| Data | Source | Filter |
|---|---|---|
| Court status + timers | `games` | All active/scheduled games |
| Now serving (offers) | `queue_entries` | `status = 'offered'` |
| Queue list | `queue_entries` | `status = 'waiting'`, ordered by `created_at` |
| Current queue position | `queue_entries` | After booking, subscribe to own entry |
| Available courts | `courts` | `status = 'Available'` |

## Touchscreen Design Rules

- All touch targets ≥ 56px (ideally 64px+ for primary actions)
- High contrast: dark text on light backgrounds, never gray-on-gray
- Font sizes: court names 16px, queue names 18px, timers 24px+ (monospace)
- Progress bars use 8px height with rounded corners
- Color coding: green = available/in-play, yellow = queue/offered, red = urgent (<60s on timer)
- No hover states (touch device) — use `active:` states for feedback
- No dropdowns, no sidebars, no multi-level navigation

## Files

### New
- `src/app/terminal/queue/page.tsx` — Main queue board page
- `src/components/terminal/QueueBoard.tsx` — Queue board component (server-fetched initial data, client Realtime updates)
- `src/components/terminal/CourtStatusCard.tsx` — Single court card
- `src/components/terminal/NowServingCard.tsx` — Now serving highlight card
- `src/components/terminal/QueueList.tsx` — Queue list with individual rows
- `src/components/terminal/BookingModal.tsx` — Booking flow modal (contains all booking steps)
- `src/components/terminal/BookingForm.tsx` — Shared booking form extracted from current page

### Modified
- `src/app/terminal/page.tsx` — Replace with redirect or move to `/terminal/queue`

### Kept unchanged
- All `src/lib/queue/` services (booking-engine, queue-service, queue-processor, reservation-service)
- `src/app/api/queue/route.ts` (POST join, PATCH accept/decline)
- `src/app/layout.tsx` (expiry processor already wired)
- Supabase schema

## Edge Cases

| Case | Handling |
|---|---|
| No active games | Court panel shows all courts as "Available", queue shows empty |
| Queue is empty | Queue list shows "No one waiting" in gray |
| Multiple offers simultaneously | Now serving shows the most recent offer (by `expires_at` desc) |
| Offer expires | Queue automatically removes from now serving, player returns to waiting |
| Booking modal open when offer arrives | Modal stays open, offer is handled when the player completes/closes the booking |
| Test mode | `?testmode=true` shows test player buttons in scan step instead of RFID input |
| Screen timeout/idle | Page uses `meta-viewport` with `maximum-scale=1.0` to prevent zoom on touch; no auto-logout since no auth |

## Non-Goals

- No auth/login on this page (public display except during booking)
- No admin actions (force-assign, remove, extend) — those stay on the dashboard
- No MQTT or IoT display management
- No changes to the queue processing backend
- No auto-rotation or slideshow mode
