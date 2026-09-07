# Freq Web Application — Agent Guide

Instructions and architecture reference for AI agents working on `web/`.

---

## Tech Stack

- **Next.js 16** (App Router, Turbopack) — full-stack React framework
- **Supabase** — PostgreSQL database, Auth, and Realtime
- **HiveMQ Cloud** — MQTT broker for physical display and kiosk communication
- **TailwindCSS** + **shadcn/ui** — UI system
- **next-themes** — dark/light mode toggle
- **Vitest** — test framework

---

## Build & Verification

```bash
cd web
npm test -- --run
npm run build
```

Expected: All 37 test suites (187 tests) pass, and `next build` compiles all 42 routes with zero type or lint errors.

---

## Architecture & Queue Mechanics

### 1. Smart Server, Thin Clients
The server is the absolute authority for queue ordering, timers, game durations, and wallet transactions. Clients (web kiosk, physical ESP32 kiosk, and LED scoreboards) render the state they receive via SSE, MQTT, or REST responses.

### 2. No Cron Dependency
Do not rely on Vercel Crons or background polling threads for critical state transitions:
- **Lazy Reconciliation:** `fetchBoardSnapshot()` in `src/app/booking/queue/actions.ts` evaluates active courts on each read. If an expired match is found, it runs `processAllCourts()` and `publishAllDisplays()`.
- **Kiosk Advance:** Physical kiosks track timers locally and call `POST /api/queue/advance` when matches end.
- **Event-Driven:** Queue joins, leaves, offer acceptances, and game terminations execute `processCourtQueue()` synchronously.

### 3. MQTT Topics
- `courts/{courtId}/display` (Server → LED Scoreboard): JSON playlist payload (`pages[]`) with multi-zone layouts, text, colors, transitions, and superscript markers (`\x01`).
- `courts/{courtId}/status` (LED Scoreboard → Server): Periodic health heartbeat.
- `freq/board` (Server → Kiosk Terminal): `BoardSnapshot` JSON containing courts, current offer, and waitlist.

---

## Key Files & Modules

| File | Purpose |
|---|---|
| `src/lib/queue/queue-processor.ts` | Server-side queue engine: process courts, promote waiting players, expire offers |
| `src/lib/queue/queue-service.ts` | Queue entry mutations, wallet deduction, positioning |
| `src/lib/queue/reservation-service.ts` | Offer confirmation, decline, and reservation policies |
| `src/lib/queue/board-snapshot.ts` | Formats authoritative queue and court state for MQTT and UI |
| `src/lib/display/sports-caster.ts` | Compiles court states into LED multi-zone playlist payloads |
| `src/lib/display/publish-all.ts` | Broadcasts display payloads across all active courts |
| `src/components/booking/BookingKiosk.tsx` | Guided booking wizard for on-site kiosk touchscreens |
| `src/app/booking/queue/page.tsx` | Live queue display board |
| `src/app/book/page.tsx` & `/bookings/page.tsx` | Member advance reservation portal |
| `src/app/api/queue/advance/route.ts` | Endpoint for hardware kiosks and external ping services to trigger reconciliation |

---

## Design System & Theme Conventions

- **Application Theme:** Standard shadcn tokens (`bg-background`, `bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`) used across standard web pages (`/book`, `/bookings`, `/dashboard`, etc.).
- **Kiosk Theme:** Custom semantic CSS variables defined in `.booking-shell` in `globals.css`:
  - `--booking-surface`
  - `--booking-panel`
  - `--booking-card`
  - `--booking-border`
  - `--booking-text`
  - `--booking-muted`
- When modifying booking or kiosk components, always use semantic variables rather than hardcoded colors (`#15231d`, `#f3f6f2`, `text-white/60`) to preserve light and dark mode contrast.
