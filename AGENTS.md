# Pickleball Court Prompter — Agent Guide

## Project

Pickleball court management system with RFID kiosk, queue management, LED display control via MQTT, and admin dashboard.

## Tech Stack

- **Next.js** (App Router) — fullstack framework
- **Supabase** — PostgreSQL DB + auth
- **MQTT** — real-time LED display updates (ESP32)
- **shadcn/ui** + Tailwind — UI components
- **next-themes** — dark/light mode toggle
- **@scalar/nextjs-api-reference** — API docs

## Build & Verify

```bash
npm run build
npx vitest run
```

Expected: `59/62` pass (3 pre-existing `esp32.test.ts` failures unrelated to app logic).

## Key Architecture

### MQTT Topics

| Topic | Direction | Payload | Description |
|---|---|---|---|
| `courts/{courtId}/display` | Server → ESP32 | `{"line1","line2","line3"}` | LED display content (published with `retain: true`) |
| `courts/{courtId}/status` | ESP32 → Server | `{"status","ip","rssi","court"}` | ESP32 health heartbeat |
| `freq.led/courts/{courtId}/status` | ESP32 → Server | (same as above) | Legacy alternate topic |

Server subscribes to both `courts/+/display` and `courts/+/status` (plus `freq.led/courts/+/status`).

### P10 Display Layout

Each display = 2 P10 panels. Physical resolution:
- **Horizontal** (side-by-side): 64×16 px = 640×160mm — shows **2 lines** of **5×7** text (line1 y=0, line2 y=8, 1px gap). **line3 is dropped.** Lines that overflow 64px **marquee horizontally** (left direction, scroll-then-wrap). Matches `web/src/components/display/P10Display.tsx` `slice(0, 2)` + `ScrollGroup`.
- **Vertical** (stacked): 32×32 px = 320×320mm — shows 3 lines of 5×7 text with 2px gaps, horizontal marquee for long text

Layout toggle in Display Monitor. Configured via `displayLayout` setting.

> Authoring rule: put the most important info in `line1` and `line2`. `line3` is best-effort — visible on 32-tall vertical panels, silently dropped on the 16-tall horizontal WF2 controller.

### Display Templates (Sequence)

Stored in `settings` table under key `displaySequence`. Three sections:
- `idle` — pages shown when court is available
- `prep` — pages shown during preparation phase
- `game` — pages shown during active game

Each section has `interval` (seconds per page) and `pages[]` (array of line templates). Supports variables:
- `{court_name}`, `{match_info}`, `{timer}`, `{queue_count}`

Cycles through pages via `POST /api/display/publish-all` (called every 5s by client processor).

### Offer Flow

1. Queue entry created (status `waiting`)
2. Court becomes available → entry status changes to `offered` with 30s timeout (`QUEUE_DEFAULT_TIMEOUT_MS = 30000`)
3. Terminal shows 30s countdown
4. User clicks Accept → `PATCH /api/queue` with `action: accept`
5. If timer expires → `processExpiredOffers()` auto-accepts via API call

### Pricing

Rates stored in `settings` table under key `prices` (JSON: `{"30":150,"60":300,"90":450}`).
Server fetches rates from settings — no hardcoded values.
`getCost(config, duration, partySize)` — UI price calculation.
Server-side `calcCharge()` in `queue-service.ts` uses same formula.

### Wallet Deduction

Atomic optimistic locking: `.eq('balance', oldBalance)` prevents race conditions.
`register_game` RPC handles atomic deductions on offer acceptance.
Refunds distribute equally across all `game_players`.

### Realtime Subscriptions

Supabase Realtime channels on `games`, `courts`, `queue_entries` tables:
- `kiosk-processor` — TerminalKiosk (10s poll fallback)
- `queue-board` — QueueBoard (5s poll fallback)
- `court-overview` — CourtOverview sidebar (5s poll fallback)

## Key Files

| File | Purpose |
|---|---|
| `src/lib/mqtt.ts` | MQTT client, publish/subscribe, display state cache |
| `src/lib/complete-expired-games.ts` | Client-side: expire offers, expire games, process available courts, publish court displays |
| `src/lib/queue/queue-service.ts` | Join/leave queue, wallet deduction |
| `src/lib/queue/queue-processor.ts` | Server-side: process court, expire offers/games |
| `src/lib/queue/booking-engine.ts` | Slot availability checks |
| `src/lib/queue/reservation-service.ts` | Accept/decline offers |
| `src/components/terminal/TerminalKiosk.tsx` | Full kiosk booking flow |
| `src/components/terminal/QueueBoard.tsx` | Public court + queue display |
| `src/components/display/P10Display.tsx` | Dot-matrix P10 LED simulator |
| `src/features/settings/components/DisplaySequenceEditor.tsx` | Admin: display template editor |
| `src/features/settings/components/ProductsEditor.tsx` | Admin: products/pricing editor |
| `src/app/api/display/publish-all/route.ts` | Periodic display publisher |
| `src/app/api/display/state/[courtId]/route.ts` | Get current display state |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/queue?memberId=` | Get member's queue entries |
| POST | `/api/queue` | Join queue or auto-assign |
| PATCH | `/api/queue` | Accept/decline offer |
| GET | `/api/mqtt` | MQTT broker status + court displays |
| POST | `/api/mqtt/publish` | Publish test display message |
| GET | `/api/display/state/{courtId}` | Get current display for a court |
| POST | `/api/display/publish-all` | Refresh all court displays |
| POST | `/api/display/heartbeat` | Track active display viewers |
| PUT | `/api/settings` | Update a setting key/value |
| GET | `/api/docs` | Scalar API reference |

## Database (Supabase)

Key tables: `courts`, `games`, `game_players`, `queue_entries`, `members`, `wallets`, `wallet_transactions`, `rfid_cards`, `settings`, `ControllerLog`.

RLS is disabled on all tables.

## Important Constants

- `QUEUE_DEFAULT_TIMEOUT_MS = 30000` — offer confirmation timeout (30s, part of 5min prep)
- `SUCCESS_DELAY_MS = 5000` — success screen auto-return
- 5 minute prep time: 30s confirmation + 2:15 entry + 2:15 exit

## ESP32 Firmware

Located in `/FreqClient/` (library) and `firmware/` (ESP32 code). Topics:
- Subscribe: `courts/{courtId}/display`
- Publish status: `courts/{courtId}/status`
- Display payload: `{line1, line2, line3}` (max 16 chars each)
