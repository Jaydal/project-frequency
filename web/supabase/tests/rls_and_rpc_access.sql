BEGIN;

SELECT plan(18);

SELECT has_table('public', 'members', 'members table exists');
SELECT has_table('public', 'wallets', 'wallets table exists');
SELECT has_table('public', 'queue_entries', 'queue_entries table exists');
SELECT has_table('public', 'controller_devices', 'controller device allowlist exists');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.members'::regclass),
  'members has row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.wallets'::regclass),
  'wallets has row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.queue_entries'::regclass),
  'queue_entries has row-level security enabled'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.controller_devices'::regclass),
  'controller_devices has row-level security enabled'
);

SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'members' AND policyname = 'members_read'), 'member read policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'wallets' AND policyname = 'wallets_read'), 'wallet read policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'queue_entries' AND policyname = 'queue_owner_read'), 'queue owner read policy exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'queue_entries' AND policyname = 'queue_owner_update'), 'queue owner update policy exists');

SELECT ok(
  NOT has_function_privilege('anon', 'public.register_game(text,text,integer,jsonb)', 'execute'),
  'anonymous clients cannot execute register_game'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.reload_wallet(text,numeric,text)', 'execute'),
  'anonymous clients cannot execute reload_wallet'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.register_game(text,text,integer,jsonb)', 'execute'),
  'authenticated clients can execute register_game through the guarded API'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.reload_wallet(text,numeric,text)', 'execute'),
  'authenticated clients can execute reload_wallet through the guarded API'
);

SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid = 'public.register_game(text,text,integer,jsonb)'::regprocedure),
  'register_game pins search_path'
);
SELECT ok(
  (SELECT proconfig @> ARRAY['search_path=public, pg_temp'] FROM pg_proc WHERE oid = 'public.reload_wallet(text,numeric,text)'::regprocedure),
  'reload_wallet pins search_path'
);

SELECT * FROM finish();
ROLLBACK;
