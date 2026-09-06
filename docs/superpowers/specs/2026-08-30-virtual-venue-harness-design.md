# Virtual Venue Harness Design

## Goal

Provide a repeatable, hardware-free venue simulation that verifies the shared
queue/display message contract across representative booking states.

## Design

`tests/virtual-venue/virtual-venue.mjs` contains an in-process retained MQTT
bus, a virtual kiosk consumer for `freq/board`, and a virtual LED display
consumer for `courts/{courtId}/display`. The harness publishes deterministic
fixtures rather than contacting Supabase, Vercel, MQTT, or real hardware.

The kiosk consumer validates board shape, preserves queue-entry identity, and
exposes the member queue lookup used by the terminal. The display consumer
validates playlist/page/zone fields and renders a small HTML preview showing
the active page and text lines. A scenario runner exercises idle, active,
waiting, offered, scheduled, malformed-payload, and queue-capacity states.

## Failure behavior

Malformed messages are rejected without replacing the last valid state. Queue
capacity is bounded to the firmware's `KIOSK_MAX_QUEUE` contract. Every
scenario uses assertions and exits non-zero on a mismatch. HTML output is
written only when requested and is treated as generated evidence.

## Verification

Run `npm run test:virtual-venue` from `web/`. The command runs the scenario
assertions and prints a summary. Add `-- --html /tmp/freq-virtual-venue.html`
to generate the display preview.
