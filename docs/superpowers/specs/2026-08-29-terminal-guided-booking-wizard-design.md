# Terminal Guided Booking Wizard Design

**Status:** Approved visual direction

## Goal

Make the Paddle Point terminal booking flow feel fast, obvious, and branded by turning it into a touch-first guided wizard with one decision per screen and a subtle animated paddle-ball visual.

## User experience

The terminal keeps the existing member and guest booking behavior, but presents the choices as a clear four-step sequence:

1. **Court** — show only courts that can be selected for the requested flow, with clear availability/status labels.
2. **Game format** — choose Singles or Doubles using large cards and short explanatory copy.
3. **Duration** — choose 30, 60, or 90 minutes with price/availability context.
4. **Review and confirm** — show a compact receipt-style summary, remaining member balance when applicable, and the final action.

The header persists throughout the wizard with the Paddle Point logo, current step number, and a compact state indicator. A back action is always available, while cancel/reset remains available for staff or kiosk timeout behavior.

## Visual direction

Use the existing dark forest terminal palette: `#101713` outer background, `#17231c` surface, `#32A45E` primary action, and warm off-white text. Avoid bright blue as a primary interaction color.

Use the official `/brand/primary-logo.svg` in the wizard header. Add a low-contrast secondary-logo watermark to the terminal shell and a small right-side brand panel where space allows. The brand panel contains a lightweight CSS-rendered paddle ball with a slow, decorative float/rotation animation. It must remain decorative, not affect layout measurement, and be hidden or reduced under `prefers-reduced-motion`.

## Component boundaries

- `TerminalKiosk` remains the state owner and keeps the existing booking/API behavior.
- `BookingStepper` owns step title, progress, member identity, and cancel affordance.
- `SelectCourt`, `SelectGameType`, and `SelectDuration` own one decision each and use common touch-card styling.
- `ConfirmBooking` owns the final summary and member-wallet confirmation state.
- A new small `TerminalBrandPanel` owns the logo/ball visual so decorative presentation does not leak into booking logic.
- `TerminalLayout` owns the shell background, watermark, responsive two-column layout, and reduced-motion behavior.

## Behavior and error handling

- Disable unavailable choices and do not render them as selectable.
- Preserve the selected state when navigating back.
- Show loading states while courts/pricing are fetched.
- Show inline errors inside the current step; do not use browser alerts for booking failures.
- Keep guest confirmation copy explicit: staff will contact the guest to confirm schedule and payment.
- After success, keep the existing timed reset behavior and ensure the decorative animation cannot prevent reset or focus restoration.
- The flow must remain usable on narrow kiosk screens and desktop web terminals.

## Accessibility and performance

- Use semantic buttons for every selectable card and visible focus states.
- Provide accessible labels for status and progress.
- Respect `prefers-reduced-motion` by disabling ball animation and nonessential transitions.
- Keep the brand treatment CSS/SVG-based or use existing optimized assets; do not add a large raster dependency.
- Use `next/image` for raster/logo assets where applicable and preserve intrinsic aspect ratios.

## Verification

- Add component/contract tests for step labels, unavailable choice disabling, back navigation state retention, and reduced-motion class behavior where the current test setup supports it.
- Run the relevant Vitest tests and `npm run build` in `web/`.
- Verify the member flow, guest flow, success reset, and narrow viewport layout manually on `/terminal`.

