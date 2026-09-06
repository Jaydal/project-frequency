# Web Brand Emphasis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Paddle Point logos noticeably more prominent on the landing page, terminal sidebar, and booking flow while preserving each interface's behavior and responsive layout.

**Architecture:** This is a presentational-only Tailwind change using existing logo assets. `LandingExperience` retains its existing header lockup, while the terminal's shared layout and booking stepper receive responsive primary-logo sizing so all booking states inherit the visual emphasis.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Vitest, Vercel.

---

### Task 1: Lock the responsive logo contract with tests

**Files:**
- Modify: `web/src/components/terminal/GuidedBookingWizard.test.tsx`
- Test: `web/src/components/terminal/GuidedBookingWizard.test.tsx`

- [ ] **Step 1: Write the failing source-level contract tests**

Add imports for `node:fs` and `node:path`, then add tests that read the affected source files and assert the intended responsive class strings:

```ts
import fs from 'node:fs';
import path from 'node:path';

const source = (file: string) => fs.readFileSync(path.join(process.cwd(), 'src/components', file), 'utf8');

it('uses an emphasized responsive logo on the landing header', () => {
  expect(source('landing/LandingExperience.tsx')).toContain('h-28 md:h-36');
});

it('uses the primary logo in the booking identity header', () => {
  const stepper = source('terminal/BookingStepper.tsx');
  expect(stepper).toContain('src="/brand/primary-logo.svg"');
  expect(stepper).toContain('h-8 sm:h-10');
});

it('enlarges the terminal sidebar primary logo', () => {
  expect(source('terminal/TerminalLayout.tsx')).toContain('h-12 sm:h-14');
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm exec vitest run src/components/terminal/GuidedBookingWizard.test.tsx`

Expected: FAIL because the current source uses smaller logo class names and the booking stepper still uses `/brand/pp-submark.svg`.

- [ ] **Step 3: Commit the red test**

```bash
git add web/src/components/terminal/GuidedBookingWizard.test.tsx
git commit -m "test: define emphasized web logo contract"
```

### Task 2: Apply the responsive primary-logo emphasis

**Files:**
- Modify: `web/src/components/landing/LandingExperience.tsx`
- Modify: `web/src/components/terminal/TerminalLayout.tsx`
- Modify: `web/src/components/terminal/TerminalBrandPanel.tsx`
- Modify: `web/src/components/terminal/BookingStepper.tsx`
- Test: `web/src/components/terminal/GuidedBookingWizard.test.tsx`

- [ ] **Step 1: Change only the existing brand lockups**

Apply these minimal class and asset changes:

```tsx
// LandingExperience.tsx
className="h-28 md:h-36 w-auto max-w-[320px] md:max-w-[360px] ..."

// TerminalLayout.tsx sidebar header logo
className="h-12 sm:h-14 w-auto max-w-[210px] object-contain object-left"

// TerminalBrandPanel.tsx decorative primary logo
className="h-10 w-auto max-w-[180px] object-contain object-left"

// BookingStepper.tsx identity image
<img src="/brand/primary-logo.svg" alt="Paddle Point" className="h-8 sm:h-10 w-auto max-w-[112px] object-contain object-left" />
```

Keep all controls, text, data flow, and decorative background images unchanged.

- [ ] **Step 2: Run the focused test to verify it passes**

Run: `npm exec vitest run src/components/terminal/GuidedBookingWizard.test.tsx`

Expected: PASS.

- [ ] **Step 3: Commit the implementation**

```bash
git add web/src/components/landing/LandingExperience.tsx web/src/components/terminal/TerminalLayout.tsx web/src/components/terminal/TerminalBrandPanel.tsx web/src/components/terminal/BookingStepper.tsx web/src/components/terminal/GuidedBookingWizard.test.tsx
git commit -m "feat: emphasize Paddle Point web branding"
```

### Task 3: Validate and deploy

**Files:**
- No source changes expected.

- [ ] **Step 1: Run the web production build**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 2: Review the committed diff for scope**

Run: `git show --check --stat HEAD`

Expected: only the planned logo and focused test changes, with no whitespace errors.

- [ ] **Step 3: Deploy the linked Vercel project to production**

Run: `vercel --prod --yes`

Expected: a production deployment URL and exit code 0.

- [ ] **Step 4: Commit any deployment-only metadata only if Vercel created it**

```bash
git status --short
```

Expected: do not commit unrelated user changes; report the production URL.
