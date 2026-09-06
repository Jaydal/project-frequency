#!/usr/bin/env sh
set -eu

schema="web/supabase/schema.sql"
migration="web/supabase/migrations/20260829000001_harden_rls_and_rpc_access.sql"

check() {
  pattern="$1"
  description="$2"
  if ! grep -q "$pattern" "$schema"; then
    printf 'database security contract: FAIL (%s)\n' "$description" >&2
    exit 1
  fi
}

check "IF p_amount IS NULL OR p_amount <= 0" "reload amount must be positive"
check "FOR UPDATE" "wallet reads must lock rows before debit"
check "IF p_duration NOT IN (30, 60, 90)" "game duration must be constrained"
check "jsonb_array_length(p_players) NOT BETWEEN 1 AND 4" "player count must be constrained"
check "v_charge IS NULL OR v_charge <= 0" "game charge must be positive"
check "HAVING count(\*) > 1" "duplicate players must be rejected"
if [ "$(grep -c "LANGUAGE plpgsql SECURITY DEFINER" "$schema")" -ne "$(grep -c "SET search_path = public, pg_temp" "$schema")" ]; then
  printf '%s\n' 'database security contract: FAIL (security-definer functions must pin search_path)' >&2
  exit 1
fi
check_migration() {
  if ! grep -q "$1" "$migration"; then
    printf 'database security contract: FAIL (%s)\n' "$2" >&2
    exit 1
  fi
}
check_migration "ENABLE ROW LEVEL SECURITY" "tables must enable RLS"
check_migration "REVOKE ALL ON FUNCTION public.register_game" "register_game must not be public"
check_migration "CREATE POLICY queue_owner_update" "queue ownership policy is required"
if ! grep -q "FOR UPDATE" web/fix_register_game.sql || ! grep -q "v_charge IS NULL OR v_charge <= 0" web/fix_register_game.sql; then
  printf '%s\n' 'database security contract: FAIL (legacy register_game script is weaker than schema)' >&2
  exit 1
fi

printf '%s\n' 'database security contract: PASS'
