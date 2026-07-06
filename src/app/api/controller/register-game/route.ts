import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishDisplay } from '@/lib/mqtt';
import { z } from 'zod';

const schema = z.object({
  courtName: z.string(),
  matchType: z.string(),
  duration:  z.number(),
  players:   z.array(z.object({
    rfid:         z.string(),
    team:         z.string().optional(),
    chargeAmount: z.number(),
  })),
});

// Hardware controllers authenticate with a static API key in x-api-key header.
// Set CONTROLLER_API_KEY in .env.local. If unset, the endpoint is open (dev only).
function checkControllerKey(request: Request): boolean {
  const apiKey = process.env.CONTROLLER_API_KEY;
  if (!apiKey) return false;
  return request.headers.get('x-api-key') === apiKey;
}

export async function POST(request: Request) {
  if (!checkControllerKey(request))
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const { courtName, matchType, duration, players } = result.data;
  const supabase = await createClient();

  // Fix #1 & #2: single atomic DB transaction — all wallet debits + game creation
  // happen inside one SQL function, so no partial state on crash.
  const { data: gameId, error } = await supabase.rpc('register_game', {
    p_court_name: courtName,
    p_match_type: matchType,
    p_duration:   duration,
    p_players:    players.map(p => ({
      rfid:          p.rfid,
      team:          p.team ?? null,
      charge_amount: p.chargeAmount,
    })),
  });

  if (error) {
    // Fix #16: never echo RFID UIDs or raw DB messages to the caller
    const msg =
      error.message.includes('Court not found')  ? 'Court not found'     :
      error.message.includes('Invalid RFID')     ? 'Invalid card'         :
      error.message.includes('Wallet not found') ? 'Wallet not found'     :
      error.message.includes('Insufficient')     ? 'Insufficient funds'   :
                                                   'Registration failed';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  // Non-critical: MQTT publish after the transaction commits
  const { data: court } = await supabase
    .from('courts').select('id, name').eq('name', courtName).single();

  if (court) {
    publishDisplay(court.id, {
      line1: court.name.toUpperCase(),
      line2: matchType,
      line3: 'RUNNING',
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, gameId });
}
