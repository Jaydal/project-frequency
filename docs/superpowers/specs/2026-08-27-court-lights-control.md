# Court Lights Control — Design Spec

**Date:** 2026-08-27
**Status:** Approved

## Overview

Add court lighting control to the pickleball system. When a game is active in the evening, the server sends an MQTT command to the kiosk to turn on lights via a relay. Lights stay on for a configurable waiting period after the last game ends.

## Architecture

Following the **Smart Server / Thin Client** model:
- **Server (Next.js)** decides *when* to turn lights on/off based on game state + time of day
- **Kiosk (ESP32)** is a dumb relay — subscribes to MQTT, toggles GPIO, shows status on screen
- No manual override — server has full control

## Hardware

| Item | Detail |
|------|--------|
| **GPIO** | GPIO 6 (Waveshare 7B 3-pin GPIO header) |
| **Relay** | Active HIGH (GPIO HIGH = lights ON) |
| **Default state** | OFF on boot |

## MQTT Protocol

**Topic:** `freq/lights` (global, not per-court)

**Payloads (server → kiosk):**

```json
{ "state": "ON" }
{ "state": "OFF" }
```

**Kiosk behavior:**
- Subscribe to `freq/lights` on MQTT connect
- Parse JSON payload, call `relay_set(state == "ON")`
- No response/publish back to server

## Server-Side Logic

### Trigger Conditions

Lights turn ON when **all** of:
1. Current hour ≥ `LIGHT_SUNSET_HOUR` (default `18`, configurable)
2. At least one court has status `IN_GAME`

Lights turn OFF when:
1. No court has been `IN_GAME` for ≥ `LIGHT_WAIT_MINUTES` (default `10`, configurable)

### Configuration

Stored in Supabase `kiosk_config` table or environment variables:

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `LIGHT_SUNSET_HOUR` | int | `18` | Hour (0-23) when lights can activate |
| `LIGHT_WAIT_MINUTES` | int | `10` | Minutes to keep lights on after last game ends |

### State Machine

```
IDLE (lights OFF)
  ├─ Evening + game starts → send ON → ACTIVE
  └─ Daytime game → no action, stay IDLE

ACTIVE (lights ON)
  ├─ Game ends → start wait timer → WAITING
  └─ New game starts → reset wait timer → ACTIVE

WAITING (lights ON, countdown running)
  ├─ Wait expires → send OFF → IDLE
  └─ New game starts → cancel timer → ACTIVE
```

### Implementation Location

Add light control logic to `queue-processor.ts`:
- Track light state (`ON`/`OFF`/`WAITING`)
- On each tick, evaluate conditions and publish MQTT when state changes
- Use existing MQTT publisher (`mqtt.ts`) to send to `freq/lights`

## Kiosk-Side Changes

### New Files

| File | Purpose |
|------|---------|
| `src/hal_esp32/esp32_relay.c` | GPIO 6 init + `relay_set(bool on)` for ESP32 |
| `src/hal_sim/sim_relay.c` | Simulator stub (prints to console) |
| `src/net/relay.h` | Common interface: `relay_init()`, `relay_set(bool on)`, `relay_is_on()` |

### Modified Files

| File | Change |
|------|--------|
| `src/net/mqtt_transport.c` | Subscribe to `freq/lights`, parse JSON, call `relay_set()` |
| `src/ui/screens/queue_board.c` | Add light status indicator (icon/label) in top-right controls area |
| `CMakeLists.txt` | Add new source files |
| `platformio.ini` | Add relay GPIO define |

### Relay Interface (`relay.h`)

```c
void relay_init(void);        // Configure GPIO 6 as output, default OFF
void relay_set(bool on);      // Set relay state
bool relay_is_on(void);       // Query current state
```

### Light Status Indicator on Kiosk Screen

On the idle screen (`queue_board.c`), add a light status indicator in the **top-right controls area** (next to the theme toggle and NFC status):

```
[☀️ LIGHTS: ON]  [NFC: OK]  [🌙/☀ theme toggle]
```

- When lights are ON: show a bulb icon (LV_SYMBOL_WIFI reused or custom label) with "LIGHTS: ON" in green/amber
- When lights are OFF: show "LIGHTS: OFF" in muted gray
- Updated reactively when the kiosk receives an MQTT `freq/lights` message

Implementation:
- Add a global `bool` in `relay.h` tracking current state
- In `queue_board_create`, read `relay_is_on()` and render the indicator
- Register an MQTT callback that calls `lv_async_call()` to refresh the indicator when state changes

## Files Summary

### New
- `src/net/relay.h`
- `src/hal_esp32/esp32_relay.c`
- `src/hal_sim/sim_relay.c`
- `docs/superpowers/specs/2026-08-27-court-lights-control.md` (this doc)

### Modified
- `src/net/mqtt_transport.c` — subscribe to `freq/lights`, handle payload
- `src/ui/screens/queue_board.c` — light status indicator
- `CMakeLists.txt` — add new sources
- `web/src/lib/queue-processor.ts` — light state machine + MQTT publish
- `web/src/lib/mqtt.ts` — publish to `freq/lights`

## Testing

1. **Simulator:** Run `cmake --build build && ./build/kiosk_sim`. Toggle relay via MQTT. Verify indicator updates on screen.
2. **Hardware:** Flash ESP32-S3, connect relay module to GPIO 6 + 5V + GND header. Send MQTT commands from HiveMQ Cloud dashboard. Verify relay clicks and indicator shows.
3. **Server:** Start a game in the web dashboard during evening hours. Verify kiosk receives ON command. End game, verify OFF after wait period.
