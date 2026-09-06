# Terminal Guided Booking Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved touch-first Paddle Point terminal booking wizard with branded motion and accessible, high-contrast controls.

**Architecture:** Keep `TerminalKiosk` as the booking state owner and preserve its existing API calls. Make the stepper and decision screens visually consistent through shared classes, add a focused decorative `TerminalBrandPanel`, and keep the shell responsive with reduced-motion support.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS v4, lucide-react, Vitest.

---

### Task 1: Add failing UI contract tests

**Files:**
- Create: `web/src/components/terminal/GuidedBookingWizard.test.tsx`

- [ ] **Step 1: Test branded wizard structure and accessible step labels**

Render `BookingStepper` and assert it exposes the current step and four labels. Render `TerminalBrandPanel` and assert its decorative image/ball content is hidden from assistive technology.

- [ ] **Step 2: Run the focused test and verify it fails because the brand panel and labels are not yet implemented**

Run: `cd web && npm test -- --run src/components/terminal/GuidedBookingWizard.test.tsx`

Expected: FAIL on the missing `TerminalBrandPanel` module or missing step labels.

### Task 2: Build the branded decorative panel and shell support

**Files:**
- Create: `web/src/components/terminal/TerminalBrandPanel.tsx`
- Modify: `web/src/components/terminal/TerminalLayout.tsx`
- Modify: `web/src/app/globals.css`

- [ ] **Step 1: Implement the CSS-rendered paddle ball panel**

Use existing Paddle Point logos, decorative `aria-hidden` markup, and `motion-safe`/`motion-reduce` classes. Avoid external assets or runtime animation libraries.

- [ ] **Step 2: Place the panel in the terminal’s two-column shell**

Keep the booking controls dominant, preserve narrow-screen stacking, and ensure `prefers-reduced-motion` disables float/rotation.

- [ ] **Step 3: Run the focused test and verify it passes**

Expected: all new component contract assertions pass.

### Task 3: Improve the four booking steps for touch interaction

**Files:**
- Modify: `web/src/components/terminal/BookingStepper.tsx`
- Modify: `web/src/components/terminal/SelectCourt.tsx`
- Modify: `web/src/components/terminal/SelectGameType.tsx`
- Modify: `web/src/components/terminal/SelectDuration.tsx`
- Modify: `web/src/components/terminal/ConfirmBooking.tsx`

- [ ] **Step 1: Add persistent accessible step labels and stronger progress state**

Use “Court,” “Format,” “Duration,” and “Review” labels with current/completed states and visible focus rings.

- [ ] **Step 2: Standardize cards and action buttons**

Use minimum touch dimensions, explicit selected/available/unavailable styling, green brand accents, and concise explanatory copy.

- [ ] **Step 3: Run focused tests and the production build**

Expected: tests pass and `npm run build` exits 0.

### Task 4: Verify the complete member and guest flows

**Files:**
- Modify: `web/src/components/terminal/TerminalKiosk.tsx` only if a visual integration prop is required.
- Test: existing terminal/API tests plus `web/src/components/terminal/GuidedBookingWizard.test.tsx`.

- [ ] **Step 1: Confirm member flow preserves state and API payloads**

Verify court → format → duration → review → booking success without changing request fields.

- [ ] **Step 2: Confirm guest flow and success reset**

Verify guest request confirmation copy remains present and the decorative panel does not interfere with reset/focus.

- [ ] **Step 3: Run `git diff --check`, focused tests, and build**

Expected: no whitespace errors, focused tests pass, and build exits 0.

