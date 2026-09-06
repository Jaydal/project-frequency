import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createTerminalMemberToken } from '@/lib/terminal-auth';
import { getRfidFormats } from '@/lib/rfid';
import { evaluateRfidScan, type PolicyMember, type PolicyGame, type PolicyQueueEntry } from '@/lib/queue/reservation-policy';
import { getPlayNowCutoff } from '@/lib/queue/booking-engine';
import { checkWindowRateLimit } from '@/lib/rate-limit';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ rfid: string }> }) {
  const clientIp = _request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
                   _request.headers.get('x-real-ip') ||
                   'client';
  if (!checkWindowRateLimit(`terminal-scan:${clientIp}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many scan attempts. Please wait a moment.' }, { status: 429 });
  }

  const { rfid } = await params;
  const supabase = await createClient();
  const upperRfid = rfid.toUpperCase();

  let member: any = null;
  let wallet: any = null;

  if (upperRfid.startsWith('TEST')) {
    const index = Math.max(0, (Number.parseInt(upperRfid.replace('TEST', ''), 10) || 1) - 1);
    const { data: members } = await supabase.from('members').select('id, member_id, first_name, last_name, status').eq('status', 'Active').order('created_at', { ascending: true }).limit(10);
    member = members?.[index % (members.length || 1)];
    if (member) {
      member.firstName = `${member.first_name} (TEST)`;
      const { data: w } = await supabase.from('wallets').select('balance').eq('member_id', member.id).maybeSingle();
      wallet = w;
    }
  } else {
    const { data: card } = await supabase.from('rfid_cards').select('member_id, status').in('uid', getRfidFormats(rfid)).maybeSingle();
    if (!card || card.status !== 'Active') return NextResponse.json({ error: 'Card not recognized.' }, { status: 404 });
    const { data: m } = await supabase.from('members').select('id, member_id, first_name, last_name, status').eq('id', card.member_id).single();
    if (m) {
      member = m;
      member.firstName = m.first_name;
      const { data: w } = await supabase.from('wallets').select('balance').eq('member_id', m.id).maybeSingle();
      wallet = w;
    }
  }

  if (!member || member.status !== 'Active') return NextResponse.json({ error: 'Member is inactive.' }, { status: 403 });

  const token = createTerminalMemberToken(member.id);
  if (!token) return NextResponse.json({ error: 'Terminal authorization is not configured.' }, { status: 503 });

  // Evaluate RFID Decision
  const now = new Date();
  const policyMember: PolicyMember = { id: member.id, status: member.status as 'Active' };

  // Fetch games
  const { data: gamePlayers } = await supabase.from('game_players').select('game_id').eq('member_id', member.id);
  const gameIds = gamePlayers?.map(gp => gp.game_id) ?? [];
  let memberGames: PolicyGame[] = [];
  if (gameIds.length > 0) {
    const { data: games } = await supabase.from('games').select('id, court_id, status, start_time, duration').in('id', gameIds);
    if (games && games.length > 0) {
      for (const g of games) {
        const startMs = new Date(g.start_time).getTime();
        const endMs = startMs + g.duration * 60_000;
        if (g.status === 'In Progress' && now.getTime() >= endMs) {
          const endIso = new Date(endMs).toISOString();
          await supabase.from('games').update({
            status: 'Completed',
            end_time: endIso,
            ended_at: endIso,
          }).eq('id', g.id);
          g.status = 'Completed';
        } else if (g.status === 'Scheduled' && now.getTime() > startMs + 15 * 60_000) {
          await supabase.from('games').update({
            status: 'No-show',
            no_show_at: now.toISOString(),
          }).eq('id', g.id);
          g.status = 'No-show';
        }
      }
    }
    memberGames = (games ?? []).map(g => ({
      id: g.id, courtId: g.court_id, status: g.status as any, startTime: new Date(g.start_time), duration: g.duration, playerIds: [member.id]
    }));
  }

  // Fetch queue entries
  const { data: qEntries } = await supabase.from('queue_entries').select('id, status').eq('member_id', member.id).in('status', ['waiting', 'offered']);
  const memberQueueEntries: PolicyQueueEntry[] = (qEntries ?? []).map(q => ({
    id: q.id, memberId: member.id, status: q.status as any
  }));

  const bestCutoff = await getPlayNowCutoff(supabase, now);
  const decision = evaluateRfidScan(policyMember, now, 60, memberGames, memberQueueEntries, bestCutoff === undefined ? undefined : (bestCutoff || undefined));

  return NextResponse.json({ 
    id: member.id, 
    memberId: member.member_id, 
    firstName: member.firstName, 
    lastName: member.last_name, 
    balance: wallet?.balance ?? 0, 
    token,
    decision
  });
}
