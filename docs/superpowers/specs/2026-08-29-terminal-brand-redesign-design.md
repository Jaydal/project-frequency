# Terminal Brand Redesign

## Goal

Refresh the web terminal at `/terminal` into a clear self-service kiosk using the official Paddle Point brand system. Preserve the existing booking flow and interaction behavior.

## Visual system

- Use the official `assets/Paddle Point/SVG/Primary Logo 1.svg` in the terminal identity/header.
- Use deep charcoal/slate for dark primary surfaces instead of blue.
- Use the logo light mark `#FCFCF6` for text and light surfaces.
- Use brand blue `#0E5E9A` sparingly for selected/focus/brand accents.
- Use brand green `#32A45E` for primary actions, available states, and success.
- Reserve amber for warnings/offers and red for destructive/error states.
- Restore the bundled Outfit font through `next/font`, with a correct Tailwind CSS variable mapping.

## Component changes

- Keep the current terminal layout, step order, data fetching, and event handlers.
- Update shared terminal surfaces, buttons, cards, labels, and status badges to use the brand-derived tokens.
- Normalize the active-booking state so its icon, badge, card, and action hierarchy use the same terminal palette.
- Replace inconsistent light-theme legacy styling in any terminal component still used by the current flow.
- Keep touch targets large and preserve readable contrast on both full-screen and sidebar states.

## Runtime fix

Mark `/api/queue/events` as public in the proxy allowlist. The terminal is public and uses browser `EventSource`, which cannot send the controller API key; the SSE endpoint should stream board updates without Supabase session middleware.

## Verification

- Run the production Next.js build.
- Verify the deployed CSS contains bundled Outfit font-face declarations.
- Verify `/api/queue/events` returns an open SSE stream rather than `401`.
- Verify the production deployment reaches `READY`.

