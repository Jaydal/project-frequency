# Device Allowlist Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove manual API-key entry from kiosk/display setup by authenticating known hardware IDs against a pre-provisioned Supabase allowlist.

**Architecture:** The API accepts a normalized `x-device-id` derived automatically from each ESP32 MAC address. Supabase stores enabled device IDs and optional court assignments; there is no runtime registration endpoint. The existing shared API-key path remains available only for backward compatibility and migration, while hardware clients use the allowlist path.

**Tech Stack:** Next.js App Router, Supabase PostgreSQL/service-role lookup, C/ESP-IDF HTTP transport, Arduino WiFi/Preferences, shell contract tests.

---

### Task 1: Define the pre-provisioned device allowlist

**Files:**
- Create: `web/supabase/migrations/<generated>_controller_devices.sql`
- Modify: `web/supabase/schema.sql`
- Test: `tests/device_allowlist_contract.sh`

- [ ] Write a failing contract requiring an enabled device table, unique normalized IDs, and no public grants.
- [ ] Run the contract and confirm it fails because the table does not exist.
- [ ] Add `controller_devices(device_id text primary key, device_type text check, court_id text nullable, enabled boolean, last_seen_at timestamptz)` with RLS enabled and no anon/authenticated grants; add an index for enabled IDs.
- [ ] Add a migration seed example as a commented insert, never a fake production device.
- [ ] Run migration/reset and pgTAP structural checks.

### Task 2: Authenticate API configuration requests by device ID

**Files:**
- Create: `web/src/lib/controller-device-auth.ts`
- Modify: `web/src/app/api/controller/config/route.ts`
- Test: `web/src/app/api/controller/config/route.test.ts`

- [ ] Add tests for unknown, disabled, malformed, and enabled device IDs.
- [ ] Run them RED.
- [ ] Implement constant-time normalized ID validation through the admin Supabase client and update `last_seen_at` only after successful authentication.
- [ ] Keep the existing `x-api-key` fallback behind an explicit migration-compatible branch.
- [ ] Run the focused route tests GREEN.

### Task 3: Make kiosk identity automatic

**Files:**
- Modify: `kiosk-terminal/src/net/freq_rest_client.h`
- Modify: `kiosk-terminal/src/net/freq_rest_client.c`
- Modify: `kiosk-terminal/src/hal_esp32/esp32_http_transport.c`
- Modify: `kiosk-terminal/src/hal_sim/sim_http_transport.c`
- Modify: `kiosk-terminal/src/ui/ui_app.c`
- Test: `kiosk-terminal/tests/device_identity_contract.sh`

- [ ] Add a failing contract requiring an automatically generated 12-hex-character device ID and `x-device-id` on config requests.
- [ ] Run it RED.
- [ ] Derive the ESP32 ID from its base MAC and use `simulator` for simulator builds; add the header through the existing portable HTTP transport.
- [ ] Fetch MQTT config using device identity, preserving API-key support only for legacy saved configurations.
- [ ] Run kiosk contracts and simulator compilation where dependencies are available.

### Task 4: Make display identity automatic

**Files:**
- Modify: `display-firmware/src/ConfigPortal.cpp`
- Modify: `display-firmware/src/ConfigPortal.h`
- Modify: `display-firmware/src/main.cpp`
- Test: `tests/display_config_bootstrap_contract.sh`

- [ ] Add a failing assertion that display config fetch sends `x-device-id` derived from `WiFi.macAddress()` and does not require an API key field.
- [ ] Run it RED.
- [ ] Add normalized MAC generation, use it for API bootstrap, and make Server URL the only server field in the portal; retain saved API key only for migration fallback.
- [ ] Run display contract and PlatformIO compile.

### Task 5: Integration and review

**Files:**
- Modify: `web/src/app/api/controller/config/route.test.ts`
- Modify: `web/supabase/tests/rls_and_rpc_access.sql`
- Modify: `tests/device_allowlist_contract.sh`

- [ ] Test allowed device, unknown device, disabled device, legacy key, missing MQTT settings, and no-store response.
- [ ] Reset local Supabase and run pgTAP.
- [ ] Run all focused web, kiosk, display, database, and credential contracts.
- [ ] Perform a security review for spoofable MAC-only authentication and document that a later per-device secret/mTLS upgrade is required for hostile networks.
