import { NextResponse, NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkControllerKey } from '@/lib/controller-auth';
import { getRfidFormats } from '@/lib/rfid';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ rfid: string }> }
) {
  const device = await authenticateControllerDevice(_request, 'kiosk');
  if (!device && !checkControllerKey(_request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  

  const { rfid } = await context.params;
  const supabase = createAdminClient();

  // Development/Test Mode: Intercept TEST001, test, etc. and map to real active members
  const upperRfid = rfid.toUpperCase();
  if (upperRfid.startsWith('TEST')) {
    const testIndex = parseInt(upperRfid.replace('TEST', '')) || 1;
    const { data: members } = await supabase
      .from('members')
      .select('*, wallets(*)')
      .eq('status', 'Active')
      .limit(10);
      
    if (members && members.length > 0) {
      const member = members[(testIndex - 1) % members.length];
      const wallet = Array.isArray(member.wallets) ? member.wallets[0] : member.wallets;
      
      const now = new Date();
      const policyMember = { id: member.id, status: member.status as 'Active' };
      const { data: gamePlayers } = await supabase.from('game_players').select('game_id').eq('member_id', member.id);
      const gameIds = gamePlayers?.map(gp => gp.game_id) ?? [];
      let memberGames: any[] = [];
      if (gameIds.length > 0) {
        const { data: games } = await supabase.from('games').select('id, court_id, status, start_time, duration').in('id', gameIds);
        memberGames = (games ?? []).map(g => ({
          id: g.id, courtId: g.court_id, status: g.status as any, startTime: new Date(g.start_time), duration: g.duration, playerIds: [member.id]
        }));
      }
      const { data: qEntries } = await supabase.from('queue_entries').select('id, status').eq('member_id', member.id).in('status', ['waiting', 'offered']);
      const memberQueueEntries = (qEntries ?? []).map(q => ({
        id: q.id, memberId: member.id, status: q.status as any
      }));
      const { getPlayNowCutoff } = await import('@/lib/queue/booking-engine');
      const { evaluateRfidScan } = await import('@/lib/queue/reservation-policy');
      const { data: settingsRows } = await supabase.from('settings').select('key, value').in('key', ['products', 'prices']);
      const settingsMap = new Map((settingsRows ?? []).map((r: any) => [r.key, r.value]));
      const tryParse = (val: any) => { try { return val ? JSON.parse(val) : undefined; } catch { return undefined; } };
      const products = tryParse(settingsMap.get('products'));
      const rates = tryParse(settingsMap.get('prices'));
      const configuredDurations: number[] = products?.durations ?? [15, 30, 60, 90];
      const validDurations = rates 
        ? configuredDurations.filter(d => rates[String(d)] !== undefined && Number(rates[String(d)]) > 0)
        : configuredDurations;
      const effectiveDurations = validDurations.length > 0 ? validDurations : configuredDurations;
      const minDuration = Math.min(...effectiveDurations);

      const bestCutoff = await getPlayNowCutoff(supabase, now);
      const decision = evaluateRfidScan(
        policyMember,
        now,
        60,
        memberGames,
        memberQueueEntries,
        bestCutoff === undefined ? undefined : (bestCutoff || undefined),
        { minDuration, allowedDurations: effectiveDurations }
      );

      return NextResponse.json({
        id: member.id,
        memberId: member.member_id,
        firstName: member.first_name + " (TEST)",
        lastName: member.last_name,
        balance: wallet?.balance ?? 0,
        status: member.status,
        decision
      });
    }
  }

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

  // Evaluate RFID Decision
  const now = new Date();
  const policyMember = { id: member.id, status: member.status as 'Active' };

  // Fetch games
  const { data: gamePlayers } = await supabase.from('game_players').select('game_id').eq('member_id', member.id);
  const gameIds = gamePlayers?.map(gp => gp.game_id) ?? [];
  let memberGames: any[] = [];
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
  const memberQueueEntries = (qEntries ?? []).map(q => ({
    id: q.id, memberId: member.id, status: q.status as any
  }));

  const { getPlayNowCutoff } = await import('@/lib/queue/booking-engine');
  const { evaluateRfidScan } = await import('@/lib/queue/reservation-policy');

  const { data: settingsRows } = await supabase.from('settings').select('key, value').in('key', ['products', 'prices']);
  const settingsMap = new Map((settingsRows ?? []).map((r: any) => [r.key, r.value]));
  const tryParse = (val: any) => { try { return val ? JSON.parse(val) : undefined; } catch { return undefined; } };
  const products = tryParse(settingsMap.get('products'));
  const rates = tryParse(settingsMap.get('prices'));
  const configuredDurations: number[] = products?.durations ?? [15, 30, 60, 90];
  const validDurations = rates 
    ? configuredDurations.filter(d => rates[String(d)] !== undefined && Number(rates[String(d)]) > 0)
    : configuredDurations;
  const effectiveDurations = validDurations.length > 0 ? validDurations : configuredDurations;
  const minDuration = Math.min(...effectiveDurations);

  const bestCutoff = await getPlayNowCutoff(supabase, now);
  const decision = evaluateRfidScan(
    policyMember,
    now,
    60,
    memberGames,
    memberQueueEntries,
    bestCutoff === undefined ? undefined : (bestCutoff || undefined),
    { minDuration, allowedDurations: effectiveDurations }
  );

  const activeGameRecord = memberGames.find(g => g.status === 'In Progress');
  const activeQueueRecord = memberQueueEntries[0];

  return NextResponse.json({
    id: member.id, // UUID — firmware needs this to book (POST /api/queue is uuid-validated)
    memberId: member.member_id,
    firstName: member.first_name,
    lastName: member.last_name,
    balance: wallet?.balance ?? 0,
    status: member.status,
    decision: {
      ...decision,
      entryId: decision.type === 'already queued' ? (decision as any).entryId : (activeQueueRecord?.id ?? undefined),
      gameId: decision.type === 'already active' ? (decision as any).gameId : (activeGameRecord?.id ?? undefined),
    },
    activeGame: activeGameRecord ? {
      id: activeGameRecord.id,
      courtId: activeGameRecord.courtId,
      duration: activeGameRecord.duration,
    } : null,
    activeQueue: activeQueueRecord ? {
      id: activeQueueRecord.id,
      status: activeQueueRecord.status,
    } : null,
  });
}
