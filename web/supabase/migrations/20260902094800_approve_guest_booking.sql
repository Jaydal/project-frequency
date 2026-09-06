CREATE OR REPLACE FUNCTION public.approve_guest_booking_request(p_request_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_request public.guest_booking_requests;
  v_game_id UUID;
  v_charge_amount INTEGER := 0; -- Or whatever default price logic
BEGIN
  -- Lock the request
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

  -- Insert into games
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

  -- Update request
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
