# Paddle Point Rebranding

## Scope
Rename and recolor the web app from "FREQ" / "Pickle Point" to **"Paddle Point"**, with location "Solano, Nueva Vizcaya" and a blue+green accent scheme.

## Brand Changes

| Current | New |
|---|---|
| FREQ (admin sidebar) | PADDLE POINT |
| Pickle Point (landing page) | Paddle Point |
| "ADMIN PORTAL" tagline | "SOLANO, NUEVA VIZCAYA" |
| F icon (emerald) | PP icon (sky blue) |
| Metadata: "Pickleball Court Management" | "Paddle Point — Pickleball Court Management" |
| MQTT client ID: `freq-web` | `paddle-point-web` |

## Color Changes

| Context | Current | New |
|---|---|---|
| Primary accent (logo, active nav, KPIs) | emerald-400/500 | sky-400/500 |
| Success / confirmation / "connected" | emerald-400 | **kept** emerald-400 |
| Landing hero gradient | green-900 → emerald-900 | sky-900 → emerald-800 |
| Court "Available" status | emerald-400 | sky-400 |
| Button primary | emerald-500 | sky-500 |

## Files

### Branding + Color
- `src/components/layout/sidebar.tsx`
- `src/app/page.tsx`
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/api/docs/route.ts`
- `src/lib/api/openapi.ts`

### Color only
- `src/app/layout.tsx` (metadata only)
- `src/components/layout/header.tsx`
- `src/components/terminal/BookingStepper.tsx`
- `src/components/terminal/ConfirmBooking.tsx`
- `src/components/terminal/SelectCourt.tsx`
- `src/components/terminal/SelectDuration.tsx`
- `src/components/terminal/SelectGameType.tsx`
- `src/components/terminal/NowServingCard.tsx`
- `src/components/terminal/ReservationOffer.tsx`
- `src/components/terminal/TerminalKiosk.tsx`

### MQTT client ID
- `src/lib/mqtt.ts`
- `src/components/terminal/TerminalKiosk.tsx`
