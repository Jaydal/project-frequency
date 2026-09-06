import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishDisplay } from '@/lib/mqtt';
import { generatePayload } from '@/lib/display/sports-caster';
import { getBoardSnapshot } from '@/lib/queue/board-snapshot';
import { publishBoardOnce } from '@/lib/queue/board-publisher';
import { publishAllDisplays } from '@/lib/display/publish-all';
import { checkControllerKey } from '@/lib/controller-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';
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

export async function POST(request: Request) {
  const device = await authenticateControllerDevice(request, 'kiosk');
  // Legacy API-key authentication is retained temporarily for already
  // deployed devices while the allowlist is populated.
  if (!device && !checkControllerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const { courtName, matchType, duration, players } = result.data;
  const supabase = createAdminClient();

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

  const { data: court } = await supabase
    .from('courts').select('id, name').eq('name', courtName).single();

  if (court) {
    publishAllDisplays().catch(e => console.error('Failed to publish display after register', e));
  }

  return NextResponse.json({ success: true, gameId });
}
