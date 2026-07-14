import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { checkControllerKey } from '@/lib/controller-auth';
import { getRfidFormats } from '@/lib/rfid';

const schema = z.object({
  rfid: z.string(),
  matchType: z.enum(['1v1', '2v2']),
  duration: z.number(),
});

export async function POST(request: Request) {
  if (!checkControllerKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const { rfid, duration } = result.data;
  const supabase = await createClient();
  const formats = getRfidFormats(rfid);

  const { data: card } = await supabase
    .from('rfid_cards')
    .select('*, members(*, wallets(*))')
    .in('uid', formats)
    .maybeSingle();

  if (!card || card.status !== 'Active')
    return NextResponse.json({ approved: false, reason: 'Invalid or inactive RFID' }, { status: 400 });

  const member = card.members as any;
  if (member?.status !== 'Active')
    return NextResponse.json({ approved: false, reason: 'Member is inactive' }, { status: 400 });

  const wallet = Array.isArray(member.wallets) ? member.wallets[0] : member.wallets;
  const balance = wallet?.balance ?? 0;

  const { data: pricesRow } = await supabase
    .from('settings').select('value').eq('key', 'prices').single();
  let ratePer30 = 150;
  try {
    if (pricesRow?.value) ratePer30 = JSON.parse(pricesRow.value)['30'] ?? 150;
  } catch {}

  const chargeAmount = ratePer30 * (duration / 30);

  if (balance < chargeAmount)
    return NextResponse.json({ approved: false, remainingBalance: balance, chargeAmount, reason: 'Insufficient balance' }, { status: 400 });

  return NextResponse.json({ approved: true, remainingBalance: balance, chargeAmount, memberId: member.member_id });
}
