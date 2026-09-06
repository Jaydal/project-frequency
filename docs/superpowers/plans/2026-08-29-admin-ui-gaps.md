# Admin UI Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the most visible admin placeholders with useful device and booking-management surfaces, expose guest requests directly, and align admin branding and colors with Paddle Point.

**Architecture:** Keep the existing App Router pages and Supabase/API boundaries. Add small client components for live device/booking data, reuse existing guest-request APIs, and keep booking mutations behind existing authenticated APIs. Normalize only invalid or clearly obsolete visual tokens in the touched admin surfaces.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, lucide-react, existing Supabase APIs.

---

### Task 1: Establish regression checks for the admin surface

**Files:**
- Create: `web/src/app/(dashboard)/admin-ui-contract.test.ts`

- [ ] **Step 1: Write route/navigation contract tests**

Assert the Kiosk page, Schedules page, and Guest Requests page files exist and the sidebar contains their links. Also assert invalid `zinc-150`/`zinc-250` tokens are absent from touched admin pages.

- [ ] **Step 2: Run the contract test and observe the expected failure**

Run: `cd web && npm test -- --run src/app/'(dashboard)'/admin-ui-contract.test.ts`

Expected: FAIL because the guest requests route and functional kiosk/schedule content do not yet exist.

### Task 2: Build Kiosk Terminals admin page

**Files:**
- Modify: `web/src/app/(dashboard)/kiosks/page.tsx`
- Create: `web/src/components/admin/KioskStatusPanel.tsx`

- [ ] **Step 1: Implement the panel using `/api/health`**

Show total devices, online devices, stale devices, each court/device name, IP, signal, and last heartbeat. Include loading/error/empty states and a link to System Health.

- [ ] **Step 2: Replace the placeholder page**

Use Paddle Point dark/green cards, clear status badges, and a link to `/terminal` for kiosk preview.

- [ ] **Step 3: Run the contract test and TypeScript build check**

Expected: contract test passes and the page compiles.

### Task 3: Add dedicated guest booking requests page and navigation

**Files:**
- Create: `web/src/app/(dashboard)/guest-requests/page.tsx`
- Modify: `web/src/components/layout/sidebar.tsx`
- Modify: `web/src/components/bookings/GuestBookingRequestsPanel.tsx`

- [ ] **Step 1: Add a dedicated page and sidebar item**

Place Guest Requests under Management with a clipboard/check icon and use the existing panel.

- [ ] **Step 2: Improve panel states and review feedback**

Add refresh action, accessible status text, non-blocking inline error, and separate expired requests from actionable pending requests.

- [ ] **Step 3: Run the focused test and build check**

Expected: route and navigation contract passes.

### Task 4: Replace Schedules placeholder with booking management overview

**Files:**
- Create: `web/src/components/admin/ScheduleOverview.tsx`
- Modify: `web/src/app/(dashboard)/schedules/page.tsx`

- [ ] **Step 1: Add date-filtered upcoming bookings overview**

Fetch `/api/bookings?date=YYYY-MM-DD&memberId=all` only if supported; otherwise create a staff-only API query that returns scheduled games with court names and player count. Provide empty/loading/error states and links to guest requests and public booking.

- [ ] **Step 2: Keep guest requests visible but link to the dedicated page**

Remove “coming soon,” explain staff confirmation for guest bookings, and add clear actions.

- [ ] **Step 3: Run focused tests and build**

Expected: no placeholder text remains and all touched routes compile.

### Task 5: Normalize branding and invalid color tokens

**Files:**
- Modify: `web/src/components/layout/sidebar.tsx`
- Modify: touched dashboard pages containing invalid zinc tokens.
- Modify: `web/src/components/ui/button.tsx`

- [ ] **Step 1: Use the existing Paddle Point SVG in admin branding**

Use `next/image` or an optimized inline image with a readable fallback and preserve dark/light contrast.

- [ ] **Step 2: Replace invalid zinc tokens and blue primary hover**

Use standard zinc tokens and the existing emerald/forest palette; preserve destructive red semantics.

- [ ] **Step 3: Run `npm run build` and `git diff --check`**

Expected: build exits 0 and diff check reports no whitespace errors.

