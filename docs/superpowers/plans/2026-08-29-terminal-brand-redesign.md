# Terminal Brand Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `/terminal` kiosk with the official Paddle Point brand system, correct bundled fonts, consistent active-booking colors, and working public SSE updates without changing booking behavior.

**Architecture:** Keep the existing `TerminalKiosk` state machine and data flow. Introduce brand tokens at the global CSS/layout boundary, use the official logo as a public asset, and make focused class-level visual changes in terminal components. Keep `/api/queue/events` public because the terminal uses browser `EventSource` without controller credentials.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, `next/font/google`, SVG assets, Vitest, Vercel.

---

### Task 1: Restore the brand font and logo asset

**Files:**
- Modify: `web/src/app/layout.tsx`
- Modify: `web/src/app/globals.css`
- Create: `web/public/brand/primary-logo.svg` from `assets/Paddle Point/SVG/Primary Logo 1.svg`

- [ ] **Step 1: Add a font regression assertion**

  Add a small source-level test in `web/src/app/layout.test.tsx` that imports the layout module and asserts the rendered body includes the `font-sans` class and the HTML layout applies a generated font variable class. If the current test setup cannot render the root layout because of provider dependencies, replace it with a focused test of an exported `outfit` font configuration helper.

- [ ] **Step 2: Run the focused test and confirm the current implementation fails**

  Run `npm exec vitest run src/app/layout.test.tsx` from `web/`. Expected: failure because the current layout has no `Outfit` configuration.

- [ ] **Step 3: Copy the approved SVG into the public brand directory**

  Copy the exact file `/Users/junedelmar/Documents/PlatformIO/Projects/Freq/assets/Paddle Point/SVG/Primary Logo 1.svg` to `web/public/brand/primary-logo.svg`. Preserve all SVG paths and the official fills `#0E5E9A`, `#32A45E`, and `#FCFCF6`.

- [ ] **Step 4: Wire `Outfit` with `next/font`**

  In `web/src/app/layout.tsx`, import `Outfit` from `next/font/google`, configure `subsets: ["latin"]`, `variable: "--font-outfit"`, and `display: "swap"`, then apply `outfit.variable` to `<html>`.

  In `web/src/app/globals.css`, change the Tailwind theme mapping from `--font-sans: var(--font-sans)` to `--font-sans: var(--font-outfit)`.

- [ ] **Step 5: Run the focused test and inspect generated CSS**

  Run `npm exec vitest run src/app/layout.test.tsx`. Then run `npm run build`; inspect the generated CSS for `@font-face`, `Outfit`, and `--font-outfit`. Expected: the test and build pass, with bundled font-face declarations present.

- [ ] **Step 6: Commit the font and asset change**

  Run `git add web/src/app/layout.tsx web/src/app/globals.css web/public/brand/primary-logo.svg web/src/app/layout.test.tsx && git commit -m "fix: restore Paddle Point terminal branding"`.

### Task 2: Fix the terminal SSE authorization boundary

**Files:**
- Modify: `web/src/lib/supabase/public-routes.ts`
- Modify: `web/src/proxy.ts`
- Test: `web/src/lib/supabase/public-routes.test.ts` (create if absent)

- [ ] **Step 1: Add a failing public-route test**

  Add `expect(isPublicPath('/api/queue/events')).toBe(true)` beside the existing public-path assertions.

- [ ] **Step 2: Run the test and confirm it fails**

  Run `npm exec vitest run src/lib/supabase/public-routes.test.ts`. Expected: failure because `/api/queue/events` is not currently allowlisted.

- [ ] **Step 3: Add the endpoint to both public-route checks**

  Add an exact `path === '/api/queue/events'` branch in `web/src/lib/supabase/public-routes.ts` and add `api/queue/events$` to the negative matcher in `web/src/proxy.ts`.

- [ ] **Step 4: Run the route test and build**

  Run `npm exec vitest run src/lib/supabase/public-routes.test.ts` and `npm run build`. Expected: both pass.

- [ ] **Step 5: Commit the SSE fix**

  Run `git add web/src/lib/supabase/public-routes.ts web/src/proxy.ts web/src/lib/supabase/public-routes.test.ts && git commit -m "fix: allow public terminal board events"`.

### Task 3: Apply the brand-derived terminal visual system

**Files:**
- Modify: `web/src/components/terminal/TerminalLayout.tsx`
- Modify: `web/src/components/terminal/TerminalKiosk.tsx`
- Modify: `web/src/components/terminal/CourtOverview.tsx`
- Modify: `web/src/components/terminal/QueueBoard.tsx`
- Modify: `web/src/components/terminal/SelectCourt.tsx`
- Modify: `web/src/components/terminal/SelectGameType.tsx`
- Modify: `web/src/components/terminal/SelectDuration.tsx`
- Modify: `web/src/components/terminal/ConfirmBooking.tsx`
- Modify: `web/src/components/terminal/BookingSuccess.tsx`
- Modify: `web/src/components/terminal/ReservationOffer.tsx`
- Modify: `web/src/components/terminal/QueueStatus.tsx`

- [ ] **Step 1: Add a terminal color contract test**

  Add a focused test or static contract check that verifies the terminal files no longer use `bg-primary` as the dominant page background and that the active-booking component contains the shared forest/gold/cream tokens. Keep behavior assertions separate from styling assertions.

- [ ] **Step 2: Run the contract and record the failing state**

  Run the focused test/contract. Expected: failure against the current blue-heavy classes and inconsistent light legacy `QueueStatus` styles.

- [ ] **Step 3: Update shared terminal surfaces**

  Use these visual tokens consistently: dark forest/charcoal page surfaces, `#FCFCF6` text/card surfaces, `#32A45E` primary actions and success, `#0E5E9A` limited focus/selected accents, amber warnings, and red destructive actions. Preserve spacing, handlers, labels, and component boundaries.

- [ ] **Step 4: Apply the official logo without changing flow**

  Add `/brand/primary-logo.svg` to the terminal identity/start surface with sizing that works on both full-screen and sidebar layouts. Use `next/image` only if the component requires raster optimization; otherwise use the public SVG as an accessible `<img>` with descriptive alt text.

- [ ] **Step 5: Normalize active-booking and legacy status styling**

  Make the active-booking icon, status badge, card, and actions use the same dark/cream/green system. Convert any currently used light `gray-*`, `amber-50`, or `red-50` blocks in `QueueStatus` to the terminal dark surface equivalents while retaining semantic amber/red meaning.

- [ ] **Step 6: Run component tests and production build**

  Run `npm exec vitest run` and `npm run build`. Expected: existing behavior tests pass and the production build passes TypeScript.

- [ ] **Step 7: Commit the terminal visual change**

  Run `git add web/src/components/terminal && git commit -m "feat: refresh terminal with Paddle Point brand system"`.

### Task 4: Verify production and deploy

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the full verification commands**

  Run `npm exec vitest run` and `npm run build` from `web/`. Confirm exit code `0` and no new failures.

- [ ] **Step 2: Deploy the linked project**

  Run `env -u VERCEL_TOKEN vercel --cwd web --prod --yes` using the authenticated CLI session.

- [ ] **Step 3: Verify the deployed result**

  Inspect the deployment with `vercel inspect <deployment-url> --cwd web`. Fetch `/terminal` and its stylesheet, confirming `@font-face`, `Outfit`, `woff2`, and `--font-outfit` are present. Open `/api/queue/events` long enough to receive `retry: 2000` or a heartbeat and confirm it does not return `401`.

- [ ] **Step 4: Report the production URL and remaining warnings**

  Report the production alias, build status, and any pre-existing npm audit warnings without applying dependency upgrades as part of this task.

