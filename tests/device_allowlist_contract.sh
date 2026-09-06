#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
schema="$root/web/supabase/schema.sql"
migration_dir="$root/web/supabase/migrations"
route="$root/web/src/app/api/controller/config/route.ts"

grep -q 'controller_devices' "$schema"
grep -q 'controller_devices' "$migration_dir"/*.sql
grep -q 'authenticateControllerDevice' "$route"
grep -q 'x-device-id' "$root/web/src/lib/controller-device-auth.ts"
grep -q 'device_id' "$root/web/src/lib/controller-device-auth.ts"

echo "device allowlist contract: PASS"
