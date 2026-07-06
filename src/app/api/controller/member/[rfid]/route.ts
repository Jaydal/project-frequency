import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkControllerKey } from '@/lib/controller-auth';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ rfid: string }> }
) {
  if (!checkControllerKey(_request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { rfid } = await context.params;
  const supabase = await createClient();

  const { data: card } = await supabase
    .from('rfid_cards')
    .select('*, members(*, wallets(*))')
    .eq('uid', rfid)
    .single();

  if (!card || card.status !== 'Active')
    return NextResponse.json({ error: 'Invalid or inactive RFID' }, { status: 404 });

  const member = card.members as any;
  if (member?.status !== 'Active')
    return NextResponse.json({ error: 'Member is inactive' }, { status: 403 });

  const wallet = Array.isArray(member.wallets) ? member.wallets[0] : member.wallets;

  return NextResponse.json({
    memberId: member.member_id,
    firstName: member.first_name,
    lastName: member.last_name,
    balance: wallet?.balance ?? 0,
    status: member.status,
  });
}
