# Terminal / Kiosk Page

## Route

`/terminal` — public (no auth), served by Vercel, loaded on kiosk browser.

## API Routes (public, no auth)

| Route | Method | Purpose |
|---|---|---|
| `/api/public/courts` | GET | List available courts |
| `/api/public/rfid/[uid]` | GET | Look up member by RFID UID → name, balance, status |
| `/api/public/queue` | POST | Register queue entry (courtId, matchType, duration, memberIds) |
| `/api/public/queue?courtId=X` | GET | Get queue for a court |

## UI Flow (single page, state machine)

1. **Scan** — hidden auto-focus input for RFID (keyboard-emulation reader). `?testmode=true` shows predefined player grid instead.
2. **Players** — collected players with name + balance. "Add another" or "Proceed".
3. **Court** — tap-friendly court cards.
4. **Match** — "2 Players (1v1)" or "4 Players (2v2)".
5. **Duration & Price** — 30/60/90 min with calculated total per player. Rate from `settings.prices`.
6. **Confirm** — summary: players + balances, court, duration, total. Submit.
7. **Done** — "Queued on Court X, Position #N". MQTT display update via existing pipeline.

## Test Account (seed)

Member: `TEST USER` / `PB-TEST-001` / RFID `TEST-RFID-001` / Wallet `₱99,999`

## Constraints

- Minimal CSS (Tailwind utilities, no shadcn components)
- Large touch targets (kiosk-friendly)
- Vanilla fetch — no heavy state management libs
