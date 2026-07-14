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
BEGIN
  SELECT * INTO v_court FROM courts WHERE name = p_court_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Court not found'; END IF;

  -- Validate ALL players before touching any money
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_charge := (v_p->>'charge_amount')::NUMERIC;
    SELECT rc.* INTO v_card FROM rfid_cards rc WHERE rc.uid = v_p->>'rfid';
    IF NOT FOUND THEN RAISE EXCEPTION 'Invalid RFID card'; END IF;
    SELECT w.* INTO v_wallet FROM wallets w WHERE w.member_id = v_card.member_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
    IF v_wallet.balance < v_charge THEN RAISE EXCEPTION 'Insufficient funds'; END IF;
    v_total := v_total + v_charge;
  END LOOP;

  -- Create game (fails fast if DB error — no money moved yet)
  INSERT INTO games (court_id, match_type, duration, status, start_time, charge_amount)
  VALUES (v_court.id, p_match_type, p_duration, 'In Progress', NOW(), v_total)
  RETURNING id INTO v_game_id;

  -- Debit wallets and register players
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_charge := (v_p->>'charge_amount')::NUMERIC;
    SELECT rc.* INTO v_card FROM rfid_cards rc WHERE rc.uid = v_p->>'rfid';
    SELECT m.*  INTO v_member FROM members m WHERE m.id = v_card.member_id;
    SELECT w.*  INTO v_wallet FROM wallets  w WHERE w.member_id = v_member.id;

    UPDATE wallets SET balance = balance - v_charge, updated_at = NOW()
    WHERE id = v_wallet.id;

    INSERT INTO wallet_transactions (wallet_id, amount, type, remarks)
    VALUES (v_wallet.id, v_charge, 'Game Charge',
      format('Match %s for %s mins on %s', p_match_type, p_duration, p_court_name));

    INSERT INTO game_players (game_id, member_id, rfid_card_id, team)
    VALUES (v_game_id, v_member.id, v_card.id, v_p->>'team');
  END LOOP;

  UPDATE courts SET status = 'In Game', last_activity = NOW() WHERE id = v_court.id;

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
AS $$
DECLARE
  v_member  members%ROWTYPE;
  v_wallet  wallets%ROWTYPE;
  v_tx_id   UUID;
BEGIN
  SELECT * INTO v_member FROM members WHERE member_id = p_member_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Member not found'; END IF;

  SELECT * INTO v_wallet FROM wallets WHERE member_id = v_member.id;
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
  duration        INTEGER NOT NULL CHECK (duration IN (30, 60, 90)),
  party_size      INTEGER NOT NULL CHECK (party_size IN (2, 4)),
  player_ids      JSONB NOT NULL DEFAULT '[]',
  court_id        TEXT REFERENCES courts(id) ON UPDATE CASCADE,
  status          TEXT NOT NULL DEFAULT 'waiting'
                    CHECK (status IN (
                      'waiting', 'offered', 'accepted',
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
