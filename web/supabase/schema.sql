-- Run this once in Supabase Dashboard → SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id     TEXT UNIQUE NOT NULL,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  middle_name   TEXT,
  birthdate     DATE,
  gender        TEXT,
  mobile_number TEXT,
  email         TEXT UNIQUE,
  emergency_contact TEXT,
  status        TEXT NOT NULL DEFAULT 'Active',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rfid_cards (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  uid           TEXT UNIQUE NOT NULL,
  member_id     UUID REFERENCES members(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'Active',
  assigned_date TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallets (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id  UUID UNIQUE NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  balance    NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id        UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  amount           NUMERIC(10,2) NOT NULL,
  type             TEXT NOT NULL,
  reference_number TEXT UNIQUE,
  payment_method   TEXT,
  staff_id         TEXT,
  remarks          TEXT,
  timestamp        TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS courts (
  id            TEXT PRIMARY KEY,
  name          TEXT UNIQUE NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Available',
  last_activity TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS games (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  court_id      TEXT NOT NULL REFERENCES courts(id) ON DELETE CASCADE ON UPDATE CASCADE,
  match_type    TEXT NOT NULL,
  duration      INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'Completed',
  start_time    TIMESTAMPTZ,
  end_time      TIMESTAMPTZ,
  charge_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_players (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id      UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES members(id),
  rfid_card_id UUID REFERENCES rfid_cards(id),
  team         TEXT
);

CREATE TABLE IF NOT EXISTS controller_logs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status           TEXT NOT NULL,
  firmware_version TEXT,
  ip_address       TEXT,
  temperature      NUMERIC(5,2),
  last_sync        TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-provisioned hardware identities. Devices authenticate by their
-- immutable ESP32 MAC address; there is intentionally no public registration
-- endpoint. Rows are inserted during deployment by an operator.
CREATE TABLE IF NOT EXISTS controller_devices (
  device_id      TEXT PRIMARY KEY CHECK (device_id ~ '^[0-9a-f]{12}$|^simulator$'),
  device_type    TEXT NOT NULL CHECK (device_type IN ('kiosk', 'display')),
  court_id       TEXT REFERENCES courts(id) ON UPDATE CASCADE,
  enabled        BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS controller_devices_enabled_idx
  ON controller_devices (device_id) WHERE enabled;

CREATE TABLE IF NOT EXISTS settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT UNIQUE NOT NULL,
  value       TEXT NOT NULL,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type       TEXT NOT NULL,
  message    TEXT NOT NULL,
  is_read    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id   TEXT,
  action    TEXT NOT NULL,
  details   TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS branches (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  location   TEXT,
  status     TEXT NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Atomic game registration (fixes non-atomic wallet debit) ─────────────────
-- All wallet debits, game creation, and court update happen in one transaction.
-- Call via supabase.rpc('register_game', { p_court_name, p_match_type, ... })
CREATE OR REPLACE FUNCTION register_game(
  p_court_name  TEXT,
  p_match_type  TEXT,
  p_duration    INTEGER,
  p_players     JSONB  -- [{rfid, team, charge_amount}]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_court   courts%ROWTYPE;
  v_card    rfid_cards%ROWTYPE;
  v_member  members%ROWTYPE;
  v_wallet  wallets%ROWTYPE;
  v_game_id UUID;
  v_total   NUMERIC(10,2) := 0;
  v_p       JSONB;
  v_charge  NUMERIC(10,2);
  v_start_time  TIMESTAMPTZ;
  v_status      TEXT;
  v_latest_end  TIMESTAMPTZ;
BEGIN
  IF p_duration NOT IN (30, 60, 90) THEN
    RAISE EXCEPTION 'Invalid duration';
  END IF;
  IF p_match_type NOT IN ('1v1', '2v2') THEN
    RAISE EXCEPTION 'Invalid match type';
  END IF;
  IF p_players IS NULL OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Invalid player count';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_players) AS player
    GROUP BY player->>'rfid'
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate player';
  END IF;

  SELECT * INTO v_court FROM courts WHERE name = p_court_name FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Court not found'; END IF;

  -- Validate ALL players before touching any money
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_charge := (v_p->>'charge_amount')::NUMERIC;
    IF v_charge IS NULL OR v_charge <= 0 OR v_charge > 100000 THEN
      RAISE EXCEPTION 'Invalid charge';
    END IF;
    SELECT rc.* INTO v_card FROM rfid_cards rc WHERE rc.uid = v_p->>'rfid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid RFID card'; END IF;
    SELECT w.* INTO v_wallet FROM wallets w WHERE w.member_id = v_card.member_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    IF v_wallet.balance < v_charge THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
    v_total := v_total + v_charge;
  END LOOP;

  -- Calculate start_time and status based on existing games
  SELECT MAX(start_time + (duration * interval '1 minute')) INTO v_latest_end
  FROM games
  WHERE court_id = v_court.id AND status IN ('In Progress', 'Scheduled');

  IF v_latest_end IS NULL OR v_latest_end <= NOW() THEN
    v_start_time := NOW();
    v_status := 'In Progress';
  ELSE
    v_start_time := v_latest_end;
    v_status := 'Scheduled';
  END IF;

  -- Create game (fails fast if DB error — no money moved yet)
  INSERT INTO games (court_id, match_type, duration, status, start_time, charge_amount)
  VALUES (v_court.id, p_match_type, p_duration, v_status, v_start_time, v_total)
  RETURNING id INTO v_game_id;

  -- Debit wallets and register players
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_charge := (v_p->>'charge_amount')::NUMERIC;
    SELECT rc.* INTO v_card FROM rfid_cards rc WHERE rc.uid = v_p->>'rfid';
    SELECT m.*  INTO v_member FROM members m WHERE m.id = v_card.member_id;
    SELECT w.*  INTO v_wallet FROM wallets  w WHERE w.member_id = v_member.id FOR UPDATE;

    UPDATE wallets SET balance = balance - v_charge, updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO wallet_transactions (wallet_id, amount, type, reference_number, remarks)
    VALUES (v_wallet.id, v_charge, 'Game Charge', v_game_id,
      format('Match %s for %s mins on %s', p_match_type, p_duration, p_court_name));

    INSERT INTO game_players (game_id, member_id, rfid_card_id, team)
    VALUES (v_game_id, v_member.id, v_card.id, v_p->>'team');
  END LOOP;

  IF v_status = 'In Progress' THEN
    UPDATE courts SET status = 'In Game', last_activity = NOW() WHERE id = v_court.id;
  END IF;

  RETURN v_game_id;
END;
$$;

-- Atomic member creation: member row + zero-balance wallet, or neither.
CREATE OR REPLACE FUNCTION create_member(
  p_member_id  TEXT,
  p_first_name TEXT,
  p_last_name  TEXT,
  p_email      TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_id UUID;
BEGIN
  INSERT INTO members (member_id, first_name, last_name, email)
  VALUES (p_member_id, p_first_name, p_last_name, NULLIF(p_email, ''))
  RETURNING id INTO v_member_id;

  INSERT INTO wallets (member_id, balance) VALUES (v_member_id, 0);

  RETURN v_member_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Member ID or email already exists';
END;
$$;

-- Atomic wallet reload: balance increment + transaction log, or neither.
CREATE OR REPLACE FUNCTION reload_wallet(
  p_member_id        TEXT,
  p_amount           NUMERIC,
  p_reference_number TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member  members%ROWTYPE;
  v_wallet  wallets%ROWTYPE;
  v_tx_id   UUID;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;
  IF p_reference_number IS NULL OR btrim(p_reference_number) = '' THEN
    RAISE EXCEPTION 'Reference number is required';
  END IF;

  SELECT * INTO v_member FROM members WHERE member_id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  SELECT * INTO v_wallet FROM wallets WHERE member_id = v_member.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;

  UPDATE wallets SET balance = balance + p_amount, updated_at = NOW()
  WHERE id = v_wallet.id;

  INSERT INTO wallet_transactions (wallet_id, amount, type, reference_number, remarks)
  VALUES (v_wallet.id, p_amount, 'Reload', NULLIF(p_reference_number, ''), 'Manual Top Up')
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Reference number already exists';
END;
$$;

CREATE TABLE IF NOT EXISTS queue_entries (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  member_id       UUID NOT NULL REFERENCES members(id),
  requested_start TIMESTAMPTZ NOT NULL,
  duration        INTEGER NOT NULL CHECK (duration > 0),
  party_size      INTEGER NOT NULL CHECK (party_size IN (2, 4)),
  player_ids      JSONB NOT NULL DEFAULT '[]',
  deposit_tx_id   UUID REFERENCES wallet_transactions(id),
  court_id        TEXT REFERENCES courts(id) ON UPDATE CASCADE,
  status          TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN (
                      'waiting', 'claimed', 'offered', 'accepted',
                      'declined', 'expired', 'cancelled',
                      'completed', 'insufficient_credits'
                    )),
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);


-- Seed courts
INSERT INTO courts (id, name, status) VALUES
  ('court-1', 'Court 1', 'Available'),
  ('court-2', 'Court 2', 'Available')
ON CONFLICT (id) DO NOTHING;

-- Seed default settings
INSERT INTO settings (key, value, description) VALUES
  ('operatingHours', '06:00-22:00',             'Daily operating hours'),
  ('prices',         '{"30":150,"60":300,"90":450}', 'Pricing per duration (minutes)'),
  ('preparationTime','120',                      'Preparation time in seconds'),
  ('cooldownTime',   '60',                       'Cooldown time in seconds'),
  ('nightMode',      '18:00',                    'Night mode start time'),
  ('bellDuration',   '3',                        'Bell duration in seconds')
ON CONFLICT (key) DO NOTHING;

-- ── Migration: queue deposit lifecycle ───────────────────────────────────────
-- 1) Track the join-time wallet transaction on each queue entry so cancels and
--    promotions can refund/re-target it per-payer.
-- 2) Allow the transient 'claimed' status used by the queue processor's atomic
--    claim (prevents concurrent processors double-booking one entry).
ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS deposit_tx_id UUID REFERENCES wallet_transactions(id);
ALTER TABLE queue_entries DROP CONSTRAINT IF EXISTS queue_entries_status_check;
ALTER TABLE queue_entries ADD CONSTRAINT queue_entries_status_check
  CHECK (status IN (
    'waiting', 'claimed', 'offered', 'accepted',
    'declined', 'expired', 'cancelled',
    'completed', 'insufficient_credits'
  ));

-- ── Migration: guest booking requests ─────────────────────────────────────────
ALTER TABLE games ADD COLUMN IF NOT EXISTS guest_booking_request_id UUID;

CREATE TABLE IF NOT EXISTS public.guest_booking_requests (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reference_code    TEXT UNIQUE NOT NULL,
  guest_name        TEXT NOT NULL,
  mobile_number     TEXT NOT NULL,
  email             TEXT,
  court_id          TEXT NOT NULL REFERENCES public.courts(id) ON UPDATE CASCADE,
  start_time        TIMESTAMPTZ NOT NULL,
  duration          INTEGER NOT NULL CHECK (duration IN (30, 60, 90)),
  party_size        INTEGER NOT NULL CHECK (party_size IN (2, 4)),
  match_title       TEXT,
  payment_method    TEXT NOT NULL CHECK (payment_method IN ('E-wallet', 'Bank Transfer', 'Walk-in')),
  payment_status    TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Confirmed', 'Not Required')),
  status            TEXT NOT NULL DEFAULT 'Pending Confirmation' CHECK (status IN ('Pending Confirmation', 'Confirmed', 'Rejected', 'Expired')),
  hold_expires_at   TIMESTAMPTZ NOT NULL,
  admin_notes       TEXT,
  confirmed_game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS guest_booking_requests_slot_idx
  ON public.guest_booking_requests (court_id, start_time, hold_expires_at)
  WHERE status = 'Pending Confirmation';

ALTER TABLE public.guest_booking_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.guest_booking_requests FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_guest_booking_request(
  p_guest_name TEXT,
  p_mobile_number TEXT,
  p_email TEXT,
  p_court_id TEXT,
  p_start_time TIMESTAMPTZ,
  p_duration INTEGER,
  p_party_size INTEGER,
  p_match_title TEXT,
  p_payment_method TEXT,
  p_reference_code TEXT,
  p_hold_expires_at TIMESTAMPTZ
) RETURNS public.guest_booking_requests
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.guest_booking_requests;
  v_end TIMESTAMPTZ := p_start_time + make_interval(mins => p_duration);
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_court_id));

  UPDATE public.guest_booking_requests
  SET status = 'Expired', updated_at = NOW()
  WHERE status = 'Pending Confirmation' AND hold_expires_at <= NOW();

  IF EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.court_id = p_court_id
      AND g.status IN ('Scheduled', 'In Progress')
      AND g.start_time < v_end
      AND g.start_time + make_interval(mins => g.duration) > p_start_time
  ) OR EXISTS (
    SELECT 1 FROM public.guest_booking_requests r
    WHERE r.court_id = p_court_id
      AND r.status = 'Pending Confirmation'
      AND r.hold_expires_at > NOW()
      AND r.start_time < v_end
      AND r.start_time + make_interval(mins => r.duration) > p_start_time
  ) THEN
    RAISE EXCEPTION 'Selected court and time are no longer available';
  END IF;

  INSERT INTO public.guest_booking_requests (
    reference_code, guest_name, mobile_number, email, court_id, start_time,
    duration, party_size, match_title, payment_method, hold_expires_at
  ) VALUES (
    p_reference_code, p_guest_name, p_mobile_number, NULLIF(p_email, ''), p_court_id, p_start_time,
    p_duration, p_party_size, NULLIF(p_match_title, ''), p_payment_method, p_hold_expires_at
  ) RETURNING * INTO v_request;

  RETURN v_request;
END;
$$;

REVOKE ALL ON FUNCTION public.create_guest_booking_request(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_guest_booking_request(TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, INTEGER, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

-- ── Migration: approve guest booking ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_guest_booking_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.guest_booking_requests;
  v_game_id UUID;
  v_charge_amount INTEGER := 0;
BEGIN
  SELECT * INTO v_request
  FROM public.guest_booking_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;

  IF v_request.status != 'Pending Confirmation' THEN
    RAISE EXCEPTION 'Request is not in pending state';
  END IF;

  INSERT INTO public.games (
    court_id, match_type, match_title, duration, status, start_time, charge_amount
  ) VALUES (
    v_request.court_id,
    CASE WHEN v_request.party_size = 4 THEN '2v2' ELSE '1v1' END,
    v_request.match_title,
    v_request.duration,
    'Scheduled',
    v_request.start_time,
    v_charge_amount
  ) RETURNING id INTO v_game_id;

  UPDATE public.guest_booking_requests
  SET status = 'Confirmed',
      confirmed_game_id = v_game_id,
      payment_status = 'Confirmed',
      updated_at = NOW(),
      reviewed_at = NOW()
  WHERE id = p_request_id;

  RETURN v_game_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_guest_booking_request(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_guest_booking_request(UUID) TO service_role;

