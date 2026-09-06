#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=========================================================="
echo "    FREQ TRI-PROJECT INTEGRATION TEST SUITE               "
echo "    Projects: web, kiosk-terminal, display-firmware      "
echo "=========================================================="
echo ""

echo "── 1. Security & Device Allowlist Contracts ──────────────"
for f in "$ROOT"/tests/*_contract.sh; do
  echo "Running $(basename "$f")..."
  bash "$f"
done
echo "Running kiosk mqtt_config_contract.sh..."
bash "$ROOT/kiosk-terminal/tests/mqtt_config_contract.sh"
echo "All contract tests passed."
echo ""

echo "── 2. Virtual Venue Multi-Device MQTT Simulation ────────"
node --test "$ROOT/tests/virtual-venue/virtual-venue.test.mjs"
node "$ROOT/tests/virtual-venue/virtual-venue.mjs"
echo ""

echo "── 3. Tripartite End-to-End System Integration ───────────"
node --test "$ROOT/tests/tripartite_integration.test.mjs"
echo ""

echo "── 4. Web Booking & Reservation Engine Integration ───────"
cd "$ROOT/web"
npx vitest run \
  src/lib/queue/reservation-policy.test.ts \
  src/lib/queue/booking-engine.test.ts \
  src/lib/queue/advanced-booking.test.ts \
  'src/app/api/bookings/[id]/route.test.ts' \
  'src/app/api/guest-booking-requests/[id]/route.test.ts' \
  src/app/api/bookings/route.test.ts \
  src/components/booking/BookingKiosk.test.ts \
  src/lib/queue/reservation-service.test.ts \
  src/app/api/controller/config/route.test.ts
echo ""

echo "── 5. End-to-End (E2E) Browser Tests ────────────────────"
npx playwright test
echo ""

echo "=========================================================="
echo "    ALL TRI-PROJECT INTEGRATION TESTS PASSED (100%)       "
echo "=========================================================="
