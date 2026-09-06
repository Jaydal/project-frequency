-- Security hardening for the Supabase deployment.
-- Members use their Supabase Auth UUID as members.id.


CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT COALESCE(
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'staff', 'operator'),
    false
  );
$$;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rfid_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controller_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY members_read ON public.members FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_staff());
CREATE POLICY members_staff_write ON public.members FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY wallets_read ON public.wallets FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.is_staff());
CREATE POLICY wallets_staff_write ON public.wallets FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY transactions_read ON public.wallet_transactions FOR SELECT TO authenticated
  USING (public.is_staff() OR wallet_id IN (SELECT id FROM public.wallets WHERE member_id = auth.uid()));
CREATE POLICY transactions_staff_write ON public.wallet_transactions FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

CREATE POLICY rfid_staff_only ON public.rfid_cards FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY courts_public_read ON public.courts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY courts_staff_write ON public.courts FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY games_public_read ON public.games FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY games_staff_write ON public.games FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY players_public_read ON public.game_players FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY players_staff_write ON public.game_players FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY settings_public_read ON public.settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY settings_staff_write ON public.settings FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY queue_owner_read ON public.queue_entries FOR SELECT TO authenticated
  USING (member_id = auth.uid() OR public.is_staff());
CREATE POLICY queue_owner_create ON public.queue_entries FOR INSERT TO authenticated
  WITH CHECK (member_id = auth.uid() OR public.is_staff());
CREATE POLICY queue_owner_update ON public.queue_entries FOR UPDATE TO authenticated
  USING (member_id = auth.uid() OR public.is_staff())
  WITH CHECK (member_id = auth.uid() OR public.is_staff());
CREATE POLICY queue_staff_delete ON public.queue_entries FOR DELETE TO authenticated
  USING (public.is_staff());

CREATE POLICY controller_logs_staff_read ON public.controller_logs FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY notifications_staff_only ON public.notifications FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());
CREATE POLICY audit_staff_read ON public.audit_logs FOR SELECT TO authenticated
  USING (public.is_staff());
CREATE POLICY audit_authenticated_insert ON public.audit_logs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()::text OR public.is_staff());
CREATE POLICY branches_staff_only ON public.branches FOR ALL TO authenticated
  USING (public.is_staff()) WITH CHECK (public.is_staff());

REVOKE ALL ON FUNCTION public.register_game(text, text, integer, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_member(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reload_wallet(text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_game(text, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_member(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reload_wallet(text, numeric, text) TO authenticated;
