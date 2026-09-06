# Web Pending Items Resolution Plan

## Implementation status (2026-08-30)

The controller-device authorization, keyless kiosk member lookup and queue
join, queue-entry cancellation, scheduled queue-entry handling, scheduled-mode
timezone conversion, RFID validation results, and bulk RFID metadata are now
implemented and covered by the web test suite. The production build and
display-firmware build pass. The production `controller_devices` table has
been created through Supabase MCP but still needs the real hardware device ID
to be provisioned. Broad public-table RLS remediation remains intentionally
deferred until explicit policies are designed and reviewed.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the stale web handoff with a verified backlog and make the keyless kiosk booking path work end-to-end without weakening staff or legacy authentication.

**Architecture:** Keep Supabase as the source of truth and reuse the existing `controller_devices` allowlist for kiosk/display identity. Add one shared controller authorization boundary for controller API routes, preserve the legacy API-key path for already deployed devices, and keep staff/session authorization separate for dashboard operations. Environment-specific device provisioning will be performed through Supabase MCP, not committed as seed data.

**Tech Stack:** Next.js App Router, TypeScript, Supabase server/admin clients, Vitest, shell contract tests, Playwright, Vercel.

---

## Current assessment

The old `docs/web-pending-items.md` should not be treated as authoritative. It says that no web work has landed, but the repository now contains guest booking, controller-device helpers, migrations, admin pages, and tests. It also references an E2E file that is not present and claims a TypeScript blocker that no longer blocks `next build`.

Confirmed still-open blockers:

1. `web/src/app/api/controller/member/[rfid]/route.ts` accepts only the legacy controller key.
2. `web/src/app/api/queue/route.ts` accepts only the legacy key, terminal token, or session; it does not accept an allowlisted controller device.
3. `web/src/app/api/queue/[id]/route.ts` treats DELETE ids as scheduled-game ids and requires `INTERNAL_API_KEY`, while the kiosk sends queue-entry ids and a device id.
4. The production `controller_devices` table requires an operations provisioning step for each physical device.
5. The scheduled member flow does not set `scheduleMode` when entering the schedule screen.
6. The RFID bulk page still needs metadata, and its production server-action error handling should be verified.

Items to defer until the blockers are fixed: offer-flow redesign, kiosk parity improvements, local E2E server diagnosis, and broad UI cleanup.

## File map

- Modify `web/src/lib/controller-device-auth.ts` — shared allowlist authentication and optional device-type checks.
- Modify `web/src/app/api/controller/member/[rfid]/route.ts` — allow kiosk devices and legacy keys.
- Modify `web/src/app/api/queue/route.ts` — allow kiosk devices on member queue operations.
- Modify `web/src/app/api/queue/[id]/route.ts` — support queue-entry cancellation and controller/staff authorization.
- Modify `web/src/components/terminal/TerminalKiosk.tsx` — mark scheduled booking mode correctly.
- Modify `web/src/app/(dashboard)/rfid/bulk/page.tsx` — add page metadata.
- Modify `web/src/features/rfid/actions/index.ts` and `web/src/app/(dashboard)/rfid/bulk/bulk-register-client.tsx` — return stable validation errors from server actions.
- Create or modify route and contract tests next to each affected API.
- Update `docs/web-pending-items.md` only after the implementation is complete, or remove it in favor of this plan.

## Task 1: Establish the authorization contract with failing tests

**Files:**

- Test: `web/src/app/api/controller/member/[rfid]/route.test.ts`
- Test: `web/src/app/api/queue/route.test.ts`
- Test: `web/src/app/api/queue/[id]/route.test.ts`
- Test: `tests/device_allowlist_contract.sh`

- [ ] **Step 1: Add member lookup tests for allowlisted kiosk and unknown devices.**

Mock `authenticateControllerDevice` and `checkControllerKey`. Assert that a valid `{ device_type: 'kiosk' }` reaches the member lookup and an unknown device returns `401` without querying member data.

- [ ] **Step 2: Add queue POST tests for allowlisted kiosk and unknown devices.**

Assert that a valid allowlisted kiosk can pass authorization and that an unknown device receives `401` before `joinQueue` is called.

- [ ] **Step 3: Add DELETE tests for queue-entry cancellation authorization and status.**

Cover: allowlisted kiosk + waiting queue entry returns `200`; unknown device returns `401`; a non-cancellable entry returns `409`; the legacy scheduled-game delete remains available to an internal API key.

- [ ] **Step 4: Run the tests and confirm they fail for the missing behavior.**

Run from `web/`:

```bash
npm test -- --run \
  'src/app/api/controller/member/[rfid]/route.test.ts' \
  'src/app/api/queue/route.test.ts' \
  'src/app/api/queue/[id]/route.test.ts'
```

Expected: the new allowlist and queue-entry cancellation assertions fail before production code changes.

## Task 2: Centralize controller-device authorization

**Files:**

- Modify: `web/src/lib/controller-device-auth.ts`
- Test: `web/src/lib/controller-device-auth.test.ts`

- [ ] **Step 1: Define the shared result type and device-type guard.**

Use a helper with this contract:

```ts
export type ControllerDeviceType = 'kiosk' | 'display';

export async function authenticateControllerDevice(
  request: Request,
  requiredType?: ControllerDeviceType,
): Promise<ControllerDevice | null>;
```

The helper must validate the `x-device-id` format, query the admin client for an enabled device, reject a mismatched `requiredType`, and update `last_seen_at` only after a successful match.

- [ ] **Step 2: Add tests for format, enabled state, and device type.**

Cover invalid ids, disabled devices, a valid kiosk, a valid display, and a display presented to a kiosk-only route.

- [ ] **Step 3: Run the helper tests and verify they pass.**

```bash
npm test -- --run src/lib/controller-device-auth.test.ts
```

## Task 3: Enable keyless kiosk member lookup and queue join

**Files:**

- Modify: `web/src/app/api/controller/member/[rfid]/route.ts`
- Modify: `web/src/app/api/queue/route.ts`
- Test: the route tests from Task 1

- [ ] **Step 1: Authorize member lookup with kiosk device or legacy key.**

Use `authenticateControllerDevice(request, 'kiosk')` first, then retain `checkControllerKey(request)` for backward compatibility:

```ts
const device = await authenticateControllerDevice(request, 'kiosk');
if (!device && !checkControllerKey(request)) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

- [ ] **Step 2: Add the same controller-device branch to queue authorization.**

The branch must run before terminal-token and session checks for controller requests, while preserving owner checks for browser/session callers.

- [ ] **Step 3: Run the route tests and the production build.**

```bash
npm test -- --run \
  'src/app/api/controller/member/[rfid]/route.test.ts' \
  'src/app/api/queue/route.test.ts'
npm run build
```

Expected: keyless kiosk authorization passes and legacy-key tests remain green.

## Task 4: Fix kiosk queue cancellation without breaking admin deletion

**Files:**

- Modify: `web/src/app/api/queue/[id]/route.ts`
- Test: `web/src/app/api/queue/[id]/route.test.ts`

- [ ] **Step 1: Resolve queue entries before scheduled games.**

For DELETE, authenticate one of: `INTERNAL_API_KEY`, an allowlisted kiosk device, or an authenticated staff/member session. Query `queue_entries` by id. For `waiting` or `offered`, call `leaveQueue(id)` and return `{ ok: true, cancelled: 'queue_entry' }`. Return `409` for other queue statuses.

- [ ] **Step 2: Preserve the scheduled-game deletion path.**

If no queue entry matches, keep the existing scheduled-game lookup for internal/admin callers. Do not let a device request delete arbitrary scheduled games.

- [ ] **Step 3: Verify refund and publication behavior through mocks.**

Assert `leaveQueue` is called once for cancellable queue entries and that the response does not report success when the entry is missing or non-cancellable.

- [ ] **Step 4: Run the route test and contract suite.**

```bash
npm test -- --run 'src/app/api/queue/[id]/route.test.ts'
cd ..
for f in tests/*.sh kiosk-terminal/tests/*.sh; do bash "$f" || exit 1; done
```

## Task 5: Provision and verify controller devices through Supabase MCP

**Files/resources:**

- Inspect: `web/supabase/migrations/20260829034112_controller_devices_allowlist.sql`
- Inspect: `web/src/lib/controller-device-auth.ts`
- Runtime resource: Supabase `controller_devices` table

- [ ] **Step 1: Obtain the physical device id from the kiosk setup screen.**

Use the 12-character lowercase MAC-derived id shown by the kiosk. Do not put a production hardware id in a migration or source file.

- [ ] **Step 2: Insert or enable the device using Supabase MCP `execute_sql`.**

Use an idempotent statement keyed by `device_id`, setting `device_type = 'kiosk'`, `enabled = true`, and the appropriate `court_id` or `NULL`.

- [ ] **Step 3: Verify the row and authorization.**

Query the row through MCP, then test the deployed member lookup/config endpoint with `x-device-id`. Do not log service-role credentials or include them in test output.

- [ ] **Step 4: Run Supabase advisors and review grants/RLS.**

Confirm the allowlist table remains protected and that only the server/admin client can perform the lookup/update used by the helper.

## Task 6: Correct remaining confirmed web defects

**Files:**

- Modify: `web/src/components/terminal/TerminalKiosk.tsx`
- Modify: `web/src/app/(dashboard)/rfid/bulk/page.tsx`
- Modify: `web/src/features/rfid/actions/index.ts`
- Modify: `web/src/app/(dashboard)/rfid/bulk/bulk-register-client.tsx`
- Test: corresponding existing unit/E2E tests

- [ ] **Step 1: Set scheduled mode when entering the schedule flow.**

Change the Schedule button to set `setScheduleMode(true)` before navigating to `select-schedule-datetime`; keep Play Now setting it to `false`.

- [ ] **Step 2: Add explicit metadata for the bulk RFID page.**

Export `metadata` with title `Bulk RFID Registration | Paddle Point` while keeping the page dynamic.

- [ ] **Step 3: Replace production-sensitive server-action throws with stable result values.**

Preserve thrown exceptions for unexpected database failures, but return a typed validation result for duplicate/unassigned RFID cases so the client does not depend on sanitized production error text.

- [ ] **Step 4: Add regression tests for duplicate RFID feedback and schedule-mode state.**

Run the focused Vitest tests and the relevant Playwright spec when credentials and a running server are available.

## Task 7: Retire the stale handoff document

**Files:**

- Modify or delete: `docs/web-pending-items.md`
- Keep: `docs/superpowers/plans/2026-08-29-web-pending-items-resolution.md`

- [ ] **Step 1: Do not commit the old document unchanged.**

After Tasks 1–6, either delete it as superseded or replace it with a short pointer to this plan and a dated list of unresolved items.

- [ ] **Step 2: Keep generated artifacts out of Git.**

Do not add `.superpowers/`, `web/test-results/`, Playwright report output, Vitest cache output, or duplicate `kiosk_config 2.ini`/`3.ini`/`4.ini` files.

## Verification and deployment gate

- [ ] Focused authorization and cancellation tests pass.
- [ ] All shell contract tests pass.
- [ ] `npm run build` passes from `web/`.
- [ ] Supabase SQL/migration checks and advisors pass.
- [ ] A provisioned kiosk can perform RFID lookup, join, and cancel against a preview deployment.
- [ ] Guest booking remains unaffected: guest request creation still requires staff confirmation and payment confirmation.
- [ ] Production deployment is inspected and reports `Ready` before the production URL is announced.

## Commit sequence

1. `test: define controller device authorization and cancellation contracts`
2. `fix: allow provisioned kiosks to use controller APIs`
3. `fix: support kiosk queue cancellation`
4. `fix: correct scheduled and RFID bulk flows`
5. `docs: retire stale web pending handoff`
