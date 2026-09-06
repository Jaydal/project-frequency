# Freq Cross-Platform Security and Quality Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the web, kiosk-terminal, and display-firmware platforms against the identified authorization, data-integrity, credential, transport, and reliability gaps while proving behavior with TDD and integration verification.

**Architecture:** Keep Supabase as the source of truth and move all privileged mutations behind explicit server-side authorization and atomic database functions. Treat kiosk and display devices as mutually authenticated thin clients: no production credentials in source, TLS enforced for network transports, bounded input/resource handling, and secure-by-default OTA/diagnostics. Preserve the existing user worktree changes and make narrowly scoped security modules rather than a broad rewrite.

**Tech Stack:** Next.js 16/TypeScript/Zod/Vitest/Playwright, Supabase PostgreSQL/RLS/RPC, ESP-IDF C/cJSON/CMake simulator, Arduino/PlatformIO/PubSubClient/ArduinoOTA.

---

### Task 1: Establish an auditable baseline

**Files:**
- Create: `docs/superpowers/plans/2026-08-29-freq-security-hardening.md`
- Modify: none
- Test: existing web Vitest suite, kiosk contract/build scripts, display PlatformIO build

- [ ] Record the pre-change worktree and keep all existing user modifications untouched.
- [ ] Run `cd web && npm run test:run`; expected baseline is the currently observed 78 passing tests.
- [ ] Run `cd web && npm run lint` with a 60-second timeout and record whether it completes.
- [ ] Run the kiosk simulator build and display firmware build; record dependency/network blockers separately from code failures.
- [ ] Run `git diff --check` and scan tracked files for credentials before implementation.

### Task 2: Add centralized web authorization and request validation tests first

**Files:**
- Create: `web/src/lib/auth/authorization.ts`
- Create: `web/src/lib/auth/authorization.test.ts`
- Create: `web/src/lib/validation/api-schemas.ts`
- Create: `web/src/lib/validation/api-schemas.test.ts`
- Modify: `web/src/lib/supabase/server.ts`

- [ ] Write failing tests proving:
  - unauthenticated requests are rejected;
  - a normal authenticated user cannot act for a different member;
  - only an explicitly configured staff/admin role can access backup, settings mutation, member administration, display control, and queue advancement;
  - controller routes require a non-empty API key and use constant-time comparison;
  - booking dates, durations, party sizes, player arrays, court IDs, and match titles are bounded and type-safe.
- [ ] Implement `requireUser`, `requireMemberAccess`, `requireStaff`, and `requireController` using server-side `auth.getUser()`; use `app_metadata` or a server-side staff table for authorization, never `user_metadata`.
- [ ] Implement shared Zod schemas with finite limits: durations restricted to configured supported values, party size restricted to 2/4, player count bounded by party size, ISO dates validated, and text lengths capped.
- [ ] Run the focused tests and confirm RED before implementation and GREEN after implementation.

### Task 3: Close web API authorization gaps

**Files:**
- Modify: `web/src/proxy.ts`
- Modify: `web/src/lib/supabase/middleware.ts`
- Modify: `web/src/app/api/queue/route.ts`
- Modify: `web/src/app/api/queue/advance/route.ts`
- Modify: `web/src/app/api/bookings/route.ts`
- Modify: `web/src/app/api/bookings/[id]/route.ts`
- Modify: `web/src/app/api/settings/route.ts`
- Modify: `web/src/app/api/backup/route.ts`
- Modify: `web/src/app/api/display/command/route.ts`
- Modify: `web/src/app/api/display/discover/route.ts`
- Modify: `web/src/app/api/display/publish-all/route.ts`
- Test: corresponding route tests under `web/src/app/api/**/route.test.ts`

- [ ] Add failing route tests for every method and negative authorization case before changing handlers.
- [ ] Remove broad public middleware prefixes for mutation/control routes; retain public access only for intentionally public read-only health/status/terminal endpoints.
- [ ] Require the owning member or authorized staff for queue GET/POST/PATCH and booking GET/POST/cancel.
- [ ] Require staff/admin for backup, settings PUT, display commands/discovery/publish, and queue advancement.
- [ ] Return generic errors without database messages, RFID values, or PII.
- [ ] Add method-independent body size limits and reject malformed JSON cleanly.
- [ ] Add CSRF/origin protection for cookie-authenticated browser mutations, while keeping controller-key routes separate.
- [ ] Run focused route tests, then the complete web test suite.

### Task 4: Make financial and booking state atomic

**Files:**
- Create: `web/supabase/migrations/<timestamp>_secure_wallet_and_booking_operations.sql`
- Modify: `web/src/lib/queue/queue-service.ts`
- Modify: `web/src/lib/queue/advanced-booking.ts`
- Modify: `web/src/lib/queue/reservation-service.ts`
- Test: `web/src/lib/queue/*test.ts`, RPC integration tests

- [ ] Write failing tests for concurrent wallet debits, negative/zero charges, duplicate players, invalid RFID cards, player-count mismatch, failed game-player insertion, cancellation ownership, and idempotent refunds.
- [ ] Replace multi-request debit/create/update sequences with transactional RPCs or a single server-side transaction boundary.
- [ ] Enforce positive bounded charges, supported durations, active cards/members, unique players per game, and valid party-size/player-count relationships in SQL and TypeScript.
- [ ] Add row locking/conditional updates for wallet and court allocation paths.
- [ ] Make cancellation select the booking owner before mutation and make refund plus status transition idempotent.
- [ ] Revoke public execute on privileged functions; grant execute only to the intended authenticated/controller role, and validate `auth.uid()`/staff authorization inside any remaining `SECURITY DEFINER` function.
- [ ] Enable RLS on every exposed table with explicit SELECT/INSERT/UPDATE/DELETE policies. Use `WITH CHECK` on updates and ownership predicates, not role-only checks.
- [ ] Run local Supabase SQL tests/advisors where available and the financial integration suite.

### Task 5: Secure device credentials, transports, and diagnostics

**Files:**
- Modify: `kiosk-terminal/src/hal_esp32/esp32_config_store.c`
- Modify: `kiosk-terminal/src/hal_sim/sim_config_store.c`
- Modify: `kiosk-terminal/src/net/freq_rest_client.c`
- Modify: `kiosk-terminal/src/hal_esp32/esp32_http_transport.c`
- Modify: `kiosk-terminal/src/hal_esp32/esp32_mqtt_transport.c`
- Modify: `display-firmware/src/main.cpp`
- Modify: `display-firmware/src/ConfigPortal.cpp`
- Modify: `display-firmware/src/MqttDisplayClient.cpp`
- Modify: `display-firmware/platformio.ini`
- Test: kiosk C contract tests, display firmware build/static checks

- [ ] Write failing contract tests proving no production secret literals exist in tracked C/C++ source, OTA has no fallback password, HTTP rejects non-TLS production URLs, and oversized response/payload inputs are rejected.
- [ ] Remove embedded HiveMQ/API/OTA credentials; require provisioned NVS/configuration or build-time secrets supplied outside source. Make simulator credentials explicit test-only fixtures.
- [ ] Enforce HTTPS/MQTTS for non-localhost targets and preserve certificate verification.
- [ ] Bound HTTP response accumulation and MQTT payload handling; reject fragmented/oversized messages safely rather than allocating without a cap.
- [ ] Stop logging RFID values, member names, balances, passwords, AP PINs, and full URLs containing secrets.
- [ ] Disable Telnet and OTA unless explicitly enabled with non-empty operator-supplied credentials; fail closed otherwise.
- [ ] Use secure per-device provisioning and rotate the currently exposed HiveMQ/API credentials outside the repository.

### Task 6: Improve build reproducibility and test coverage

**Files:**
- Modify: `kiosk-terminal/CMakeLists.txt`
- Modify: `kiosk-terminal/tests/*.sh`
- Modify: `web/package.json`
- Modify: `.gitignore`
- Test: CI/static checks and integration tests

- [ ] Add tests for malformed MQTT JSON, fragmented payloads, missing fields, oversized payloads, failed HTTP responses, timeout behavior, and cancellation races.
- [ ] Make CMake dependencies reproducible from checked-in/vendor/cache sources or fail with a clear offline diagnostic; do not silently fetch mutable dependencies.
- [ ] Remove duplicate/stale lockfile and generated test-result artifacts from tracked or unignored paths after confirming ownership.
- [ ] Add CI commands for web typecheck/lint/test/build, kiosk simulator/contract tests, and display firmware compilation.
- [ ] Add dependency audit/SBOM checks that fail on high-severity vulnerabilities when registry access is available.

### Task 7: End-to-end integration verification

**Files:**
- Create: `web/tests/integration/security-boundary.spec.ts`
- Create: `web/tests/integration/booking-financial-consistency.test.ts`
- Create/modify: kiosk simulator integration harness
- Create/modify: display MQTT contract harness

- [ ] Verify unauthenticated, normal-user, staff, and controller flows against a disposable/local Supabase fixture.
- [ ] Exercise join queue → wallet debit → promotion → game creation → cancellation/refund, including injected failures and concurrent requests.
- [ ] Exercise kiosk REST/MQTT parsing against the real Next.js route contracts.
- [ ] Exercise display payload publishing and firmware parsing with malformed, oversized, and valid playlists.
- [ ] Verify that no secret, RFID, or wallet PII appears in logs or HTTP responses.

### Task 8: Final verification and code review

**Files:**
- Modify only files required by review findings.

- [ ] Re-read this plan and check every acceptance criterion.
- [ ] Run fresh full verification:
  - `cd web && npm run test:run`
  - `cd web && npm run lint`
  - `cd web && npm run build`
  - all kiosk contract/simulator tests and CMake build
  - `cd display-firmware && pio run -e esp32-hub75-wf2`
  - `git diff --check`
  - credential/static security scans
- [ ] Dispatch a focused code review covering authorization, RLS/RPC security, financial atomicity, embedded-device transport security, and test completeness.
- [ ] Fix all critical/important review findings, rerun affected RED/GREEN tests, and document any environment-blocked verification honestly.
- [ ] Report changed files, tests run with exact results, remaining risks, and required operational actions such as credential rotation.

---

