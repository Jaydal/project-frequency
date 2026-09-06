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
