# Freq — Pickleball Court Management System

Monorepo for a commercial pickleball court management system following a **Smart Server / Thin Client** architecture. The Next.js full-stack server handles business logic, pricing, wallet accounting, and queue advancement; the physical clients (LED matrix scoreboards and ESP32 touchscreen kiosk) are stateless or thin clients that render live updates via MQTT and HTTP REST.

---

## Repository Structure

```
Freq/
├── web/                Next.js 16 App Router full-stack web application
├── display-firmware/   ESP32-S3 LED scoreboard firmware (Huidu HD-WF2 + Hub75 DMA)
├── kiosk-terminal/     ESP32-S3 LVGL touchscreen kiosk (Waveshare 7" + PN532 RFID)
└── docs/               Hardware bug reports, system design specs, and historical plans
```

---

## System Architecture

```
                                  ┌───────────────────────────┐
                                  │      HiveMQ Cloud         │
                                  │      (MQTT Broker)        │
                                  └──────┬─────────────┬──────┘
                                         ▲             │
                     courts/<id>/display │             │ freq/board
                     courts/<id>/status  │             │
                                         │             ▼
┌───────────────────────────┐     ┌──────┴──────┐     ┌───────────────────────────┐
│     display-firmware      │     │    web/     │     │      kiosk-terminal       │
│  (Huidu HD-WF2 ESP32-S3)  │     │ (Next.js 16)│◄────┤ (Waveshare 7" ESP32-S3)   │
│  2× P10 32x16 LED Panels  │     │  Supabase   │HTTP │ RFID Card Reader (PN532)  │
│  DMA Double Buffered      │     └─────────────┘REST │ Single Framebuffer Direct │
└───────────────────────────┘                         └───────────────────────────┘
```

### Core Principles

1. **Smart Server, Thin Displays:** The physical displays and kiosk terminals do not calculate queue positions, match durations, or wallet balances. Next.js computes all state transitions and distributes them over MQTT and SSE.
2. **Single Source of Truth:** Supabase (PostgreSQL + Auth + Realtime) is the authoritative database.
3. **No Cron Dependency:** Queue progression, game completion, and offer timeouts operate opportunistically and reactively without needing Vercel Cron jobs:
   - **Lazy Reconciliation:** Every queue board fetch (`fetchBoardSnapshot`) inspects active court timers and triggers `processAllCourts()` in the background if a game elapsed.
   - **Reactive Kiosk Advance:** The physical touchscreen kiosk tracks court timers locally and fires `POST /api/queue/advance` when a court window concludes.
   - **Event-Driven:** Every player queue join, leave, offer acceptance, or RFID checkout triggers court processing synchronously.
4. **Cloud Infrastructure Only:** HiveMQ Cloud (MQTTS on port 8883) and Supabase Cloud. Local Mosquitto brokers and local database instances are obsolete.

---

## Projects

### 1. `web/` — Full-Stack Application
- **Tech Stack:** Next.js 16 (App Router, Turbopack), TypeScript, TailwindCSS, Supabase, `next-themes`.
- **Features:**
  - **Live Queue Display (`/booking/queue`):** Real-time board with animated court timers, now-serving reservation callouts, and upcoming scheduled matches.
  - **Guided Booking Kiosk Wizard (`/booking`):** Self-service kiosk interface for walk-up RFID scans and guest bookings.
  - **Member Booking Portal (`/book`, `/bookings`):** Player-facing reservation workflow with slot availability, multi-court grid, receipt breakdown, and cancellation window rules.
  - **Admin Dashboard (`/dashboard`, `/courts`, `/members`, `/wallet`, `/rfid`, `/reports`):** Full facility controls, drag-and-drop queue reordering, court light switches, and RFID bulk registration.
  - **Display Sequence Designer (`/settings`):** Visual WYSIWYG editor for customizing LED scoreboard zone layouts, fonts, colors, and transitions.

```bash
cd web
npm install
npm run dev
# Run test suite (37 suites, 187 tests)
npm test -- --run
# Production build
npm run build
```

### 2. `display-firmware/` — LED Court Scoreboards
- **Hardware:** Huidu HD-WF2 (ESP32-S3) driving 2× P10 RGB LED Matrix Panels (32×16 each chained horizontally to 64×16).
- **Core Logic:** Subscribes to `courts/<courtId>/display` over HiveMQ MQTTS. Receives JSON playlist payloads (`pages[]`), parses multi-zone text with custom 5×7 bitmap fonts and superscript markers (`\x01`), and flips DMA buffers locally.
- **Setup:** Includes a captive WiFi portal (`ConfigPortal`) on initial boot or upon holding the factory reset button (GPIO 17) for 5 seconds.

```bash
cd display-firmware
pio run -e esp32-hub75-wf2
pio run -e esp32-hub75-wf2 -t upload
```

### 3. `kiosk-terminal/` — Touchscreen Kiosk
- **Hardware:** Waveshare ESP32-S3 Touch LCD 7" with PN532 NFC reader routed to UART2 (`GPIO 43/44`) as a secondary I2C bus (`I2C_NUM_1`).
- **Core Logic:** Subscribes to `freq/board` to render the live queue board, sends REST calls to `/api/terminal/member/[rfid]` and `/api/queue` for player check-in, and renders with LVGL in single-framebuffer direct mode (`direct_mode = 1`) to eliminate screen tearing without PSRAM starvation.
- **Simulator:** Runs natively on macOS/Linux using SDL2.

```bash
# Run simulator
cd kiosk-terminal
cmake -B build -S .
cmake --build build -j
./build/kiosk_sim

# Flash hardware
cd kiosk-terminal
pio run -e esp32s3 -t upload
```

---

## MQTT Specification

| Topic | Direction | Payload | Description |
|---|---|---|---|
| `courts/{courtId}/display` | Server → Scoreboard | `DisplayPlaylistPayload` JSON (`pages[]`, zones, colors) | LED scoreboard playlist |
| `courts/{courtId}/status` | Scoreboard → Server | `{"status":"online","ip":"...","rssi":-54,"court":"c1"}` | Scoreboard health heartbeat |
| `freq/board` | Server → Kiosk | `BoardSnapshot` JSON (`courts[]`, `nowServing`, `queue[]`) | Live venue queue snapshot |

---

## Vercel Deployment

Deploying the monorepo to Vercel requires configuring the project's **Root Directory** in the Vercel Dashboard:

1. Open your project on [Vercel](https://vercel.com) → **Settings** → **General**.
2. Set **Root Directory** to `web` and click **Save**.
3. *Vercel Hobby Plan:* Vercel Hobby accounts reject minute-by-minute crons. The web application does not require any Vercel crons—all background transitions operate via lazy reconciliation and client event triggers.
