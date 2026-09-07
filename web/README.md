# Freq Web Application

The central server and web dashboard for the Freq pickleball court management system. Built with Next.js (App Router), Supabase, TypeScript, and TailwindCSS.

---

## Features

- **Live Queue Display (`/booking/queue`):** Real-time venue status board showing active court matches, remaining game time, currently serving offers, and upcoming queue list.
- **Guided Booking Kiosk (`/booking`):** Self-service wizard for on-site kiosk touchscreens with RFID member sign-in and guest reservations.
- **Member Booking Portal (`/book`, `/bookings`):** Player-facing advance booking with date & time slot selection, real-time availability checking, wallet charges, and booking management.
- **Facility Management Dashboard:**
  - `/dashboard`: High-level metrics, active matches, and quick queue overview.
  - `/courts`: Live court occupancy, manual game assignment, and court light controls.
  - `/members`: Member directory, wallet balances, and transaction histories.
  - `/wallet`: Member account top-ups, debits, and audit logs.
  - `/rfid` & `/rfid/bulk`: Individual and batch card assignment for physical NFC tags.
  - `/schedules`: Advanced booking grid, schedule management, and guest request approvals.
  - `/settings`: Business configuration, pricing tiers (`prices`), durations, and the visual LED Display Sequence Designer.
  - `/virtual-displays`: In-browser virtual LED emulator mirroring physical P10 scoreboards.

---

## Queue Advancement Architecture (No Crons Required)

The application does not depend on Vercel Crons or persistent background Node intervals for critical game transitions:

1. **Lazy / Opportunistic Reconciliation:**
   Inside `fetchBoardSnapshot()` (`src/app/booking/queue/actions.ts`), whenever any client reads the board, the server inspects active games and triggers `processAllCourts()` if any court timer has expired.
2. **Kiosk Hardware Advance:**
   The physical kiosk terminal (`kiosk-terminal`) tracks court countdowns locally and posts to `/api/queue/advance` whenever a match concludes or an idle court has waiting players.
3. **Event-Driven Lifecycle:**
   Queue actions (`/api/queue`, `/api/terminal/game/end`, RFID taps) immediately trigger synchronous queue processing and broadcast updated MQTT payloads.

---

## Getting Started

### Prerequisites
- Node.js 20+ (recommended v22)
- npm 10+
- Supabase Project (PostgreSQL database + Supabase Auth)
- HiveMQ Cloud broker credentials

### Environment Configuration
Create `.env.local` in `web/` with the following keys:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>

# HiveMQ Cloud MQTT
MQTT_BROKER_URL=mqtts://<your-cluster>.hivemq.cloud:8883
MQTT_USERNAME=<your-mqtt-username>
MQTT_PASSWORD=<your-mqtt-password>

# Controller Authentication
CONTROLLER_API_KEY=<shared-api-key-for-hardware-devices>
```

### Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Run Vitest test suite (37 test suites, 187 tests)
npm test -- --run

# Run Next.js production build
npm run build
```

---

## Deployment (Vercel)

This application is deployed as part of the monorepo on Vercel:

1. In the Vercel Dashboard, go to **Settings** > **General**.
2. Set **Root Directory** to `web`.
3. Add environment variables matching your `.env.local`.
4. Deploy! The project is fully compatible with Vercel Hobby accounts (no cron configuration required).
