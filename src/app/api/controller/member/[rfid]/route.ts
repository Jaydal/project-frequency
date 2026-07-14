import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkControllerKey } from '@/lib/controller-auth';
import { processExpiredGames, processExpiredOffers } from '@/lib/queue/queue-processor';
import { getRfidFormats } from '@/lib/rfid';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ rfid: string }> }
) {
  if (!checkControllerKey(_request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  
  // Clean up any expired games/offers before checking user state
  // This compensates for setInterval not running on Vercel's serverless environment
  await Promise.allSettled([
    processExpiredGames(),
    processExpiredOffers()
  ]);

  const { rfid } = await context.params;
  const supabase = await createClient();
  const formats = getRfidFormats(rfid);

  const { data: card } = await supabase
    .from('rfid_cards')
    .select('*, members(*, wallets(*))')
    .in('uid', formats)
    .maybeSingle();

  if (!card || card.status !== 'Active')
    return NextResponse.json({ error: 'Invalid or inactive RFID' }, { status: 404 });

  const member = card.members as any;
  if (member?.status !== 'Active')
    return NextResponse.json({ error: 'Member is inactive' }, { status: 403 });

  const wallet = Array.isArray(member.wallets) ? member.wallets[0] : member.wallets;

  return NextResponse.json({
    id: member.id, // UUID — firmware needs this to book (POST /api/queue is uuid-validated)
    memberId: member.member_id,
    firstName: member.first_name,
    lastName: member.last_name,
    balance: wallet?.balance ?? 0,
    status: member.status,
  });
}
