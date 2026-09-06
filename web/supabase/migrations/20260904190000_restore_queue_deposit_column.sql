-- The queue service records the wallet transaction used for a queue deposit.
-- Keep this idempotent so environments created from older migrations can be
-- brought up to date safely.
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS deposit_tx_id UUID REFERENCES public.wallet_transactions(id);

-- Ask PostgREST to refresh its table schema immediately after deployment.
NOTIFY pgrst, 'reload schema';
