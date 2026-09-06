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
  v_court       courts%ROWTYPE;
  v_card        rfid_cards%ROWTYPE;
  v_member      members%ROWTYPE;
  v_wallet      wallets%ROWTYPE;
  v_game_id     UUID;
  v_total       NUMERIC(10,2) := 0;
  v_p           JSONB;
  v_charge      NUMERIC(10,2);
  v_start_time  TIMESTAMPTZ;
  v_status      TEXT;
  v_latest_end  TIMESTAMPTZ;
BEGIN
  IF p_duration NOT IN (30, 60, 90) THEN RAISE EXCEPTION 'Invalid duration'; END IF;
  IF p_match_type NOT IN ('1v1', '2v2') THEN RAISE EXCEPTION 'Invalid match type'; END IF;
  IF p_players IS NULL OR jsonb_array_length(p_players) NOT BETWEEN 1 AND 4 THEN RAISE EXCEPTION 'Invalid player count'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_players) AS player GROUP BY player->>'rfid' HAVING count(*) > 1) THEN RAISE EXCEPTION 'Duplicate player'; END IF;

  SELECT * INTO v_court FROM courts WHERE name = p_court_name;
  IF NOT FOUND THEN RAISE EXCEPTION 'Court not found'; END IF;

  -- Validate ALL players before touching any money
  FOR v_p IN SELECT * FROM jsonb_array_elements(p_players) LOOP
    v_charge := (v_p->>'charge_amount')::NUMERIC;
    IF v_charge IS NULL OR v_charge <= 0 OR v_charge > 100000 THEN RAISE EXCEPTION 'Invalid charge'; END IF;
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

    INSERT INTO wallet_transactions (wallet_id, amount, type, remarks)
    VALUES (v_wallet.id, v_charge, 'Game Charge',
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
