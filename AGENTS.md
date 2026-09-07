# Agent Instructions — Freq Court Display

Instructions for AI agents working on this codebase.

---

## Project Ecosystem

This repository is a monorepo containing multiple interconnected projects for a commercial pickleball court management system. The system follows a "Smart Server / Thin Client" model.

### 1. `web/` (Next.js Full-Stack Application)
The central brain of the system.
- **Tech Stack:** Next.js (App Router), Supabase (PostgreSQL + Realtime), TailwindCSS, TypeScript.
- **Responsibilities:**
  - **Admin Dashboard & Web Kiosk:** UIs for managing courts, users, and the queue.
  - **Queue Processor (`queue-processor.ts`):** A server-side background worker that advances the queue, handles timers, and expires offers.
  - **MQTT Publisher (`mqtt.ts`):** Calculates and publishes "Sports Caster" playlist payloads (`pages[]`) to `courts/<courtId>/display` for the LED scoreboards. Also publishes the full live queue state to `freq/board` for the physical kiosk.
  - **Web API:** Handles POST/PATCH/DELETE requests for the kiosk terminal (RFID lookups, joining queue, etc).

### 2. `display-firmware/` (LED Court Scoreboards)
The physical display panels mounted above each court.
- **Hardware:** Huidu HD-WF2 (ESP32-S3) driving 2× P10 RGB LED Matrix Panels (32x16 each).
- **Core Logic:** "Dumb" clients. They subscribe to MQTT (`courts/<courtId>/display`), receive a JSON playlist payload (`pages[]`), and handle local rotation timers (e.g. rotating content every 10 seconds).
- **Key Constraints:**
  - Uses Hardware DMA Double Buffering (`_matrix->flipDMABuffer()`) for smooth scrolling without flickering.
  - Has a Captive Portal (`ConfigPortal`) for initial WiFi/MQTT setup.
  - **CRITICAL:** Always call `WiFi.mode(WIFI_OFF); delay(100);` before initializing the DMA matrix to prevent a hard freeze.
  - **Compile:** `cd display-firmware && pio run -e esp32-hub75-wf2`

### 3. `kiosk-terminal/` (ESP32 Touchscreen Kiosk)
The physical interactive touchscreen terminal where players scan their RFID cards to join the queue.
- **Tech Stack:** C, LVGL (Light and Versatile Graphics Library), CMake (Simulator), PlatformIO/ESP-IDF (Hardware).
- **Core Logic:**
  - Subscribes to MQTT (`freq/board`) to receive the live queue status (who is waiting, court status) directly from the Next.js server.
  - Acts as an HTTP REST client to the Next.js API (`freq_rest_client.c`) when a user joins the queue or accepts an offer.
  - Has a bootloader (`KIOSK_STEP_BOOTING`) that waits for MQTT and API connectivity before showing the Idle screen.
- **Hardware/Memory Constraints (ESP32-S3 RGB LCD):**
  - Uses a single PSRAM framebuffer (`num_fbs = 1`) with LVGL direct mode (`direct_mode = 1`) to prevent PSRAM DMA starvation and Wi-Fi interrupt crashing.
  - `LV_THEME_DEFAULT_GROW` is disabled in `lv_conf.h` to prevent multi-frame shrink animations on buttons, which would otherwise tear/flicker heavily in single-buffer mode.
  - **I2C / NFC Hardware Conflict:** The PN532 NFC reader CANNOT use the board's I2C header due to a hardcoded `0x24` address collision with the internal screen controller (CH32V003). It is instead routed to **UART2** (Pins 43/44) configured as a secondary I2C bus (`I2C_NUM_1`). The board's DIP switch MUST be set to UART2, and flashing/logging MUST be done via Native USB (the `USB` port, not `UART`).
- **Compile (Simulator):** `cd kiosk-terminal && cmake -B build -S . && cmake --build build -j 2>&1 | grep -v "pn532_is_online" && ./build/kiosk_sim`
  - Note: Linker error `pn532_is_online` is expected in simulator (PN532 hardware driver not compiled); ignore it.

---

## Architectural Principles

1. **Smart Server, Dumb Displays:** The physical hardware (both LED matrices and LVGL Kiosks) should not compute business logic. The Next.js API handles all queue math, timers, state changes, and wallet deductions.
2. **Single Source of Truth:** Supabase is the absolute source of truth. The web kiosk and API read directly from it. 
3. **Cloud Infrastructure Only:** Local Mosquitto brokers and local PostgreSQL databases are strictly **obsolete** for this project. The physical displays (`hdwf2`) and `kiosk-terminal` rely purely on MQTT (HiveMQ Cloud) for live updates. The web application relies exclusively on Supabase for database and real-time features.
4. **No Client-Side Mutation Races:** UIs should not use `setInterval` to manually advance queue states in the database. Rely on the server-side `queue-processor.ts`.
5. **No Cron Dependency (Vercel Hobby Compatibility):** Do not add sub-daily cron schedules to `vercel.json`. Queue progression and expired game reconciliation operate opportunistically via `fetchBoardSnapshot()` lazy checking, hardware kiosk triggers (`POST /api/queue/advance`), and event-driven mutations.

---

## Development Workflow

1. Always verify which project folder the user is asking you to modify (`web/`, `display-firmware/`, or `kiosk-terminal/`).
2. When modifying the display payload structure, ensure you update the Next.js publisher (`sports-caster.ts`) AND the ESP32 parser (`MqttDisplayClient.cpp`).
3. For C/LVGL modifications in `kiosk-terminal`, leverage `LV_EVENT_DELETE` to free dynamically allocated contexts to prevent memory leaks.
