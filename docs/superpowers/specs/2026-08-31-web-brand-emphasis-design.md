# Web Brand Emphasis Design

## Goal

Make Paddle Point branding more prominent and visually consistent on the public landing page, terminal page, and booking flow without changing navigation, copy, colors, or booking behavior.

## Scope

- Increase the landing header's existing Paddle Point logo by roughly 40%, with responsive limits that preserve the Book Now button and avoid horizontal overflow.
- Increase the primary logo in the terminal sidebar and its decorative brand panel so the brand remains clear at kiosk and desktop sizes.
- Replace the booking stepper's small submark with the primary Paddle Point logo, sized compactly enough to retain the member, balance, cancellation, and stepper controls on small screens.

## Implementation Boundaries

- Reuse existing logo assets and the current Tailwind styling model.
- Do not introduce new pages, assets, data changes, API changes, or interactions.
- Maintain the terminal's existing responsive layout and accessibility semantics; all informative logos retain meaningful alternative text and decorative logos remain hidden from assistive technology.

## Verification

- Run the focused terminal component tests.
- Run the production web build to verify TypeScript and responsive class compilation.
- Review the changed page components for the agreed responsive sizing constraints.
