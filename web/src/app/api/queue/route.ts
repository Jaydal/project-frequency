import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { joinQueue, getQueuePosition, getEstimatedWait } from '@/lib/queue/queue-service';
import { finalizeBooking, declineOffer } from '@/lib/queue/reservation-service';
import { publishBoardOnce } from '@/lib/queue/board-publisher';
import { checkControllerKey } from '@/lib/controller-auth';
import { hasStaffRole, isSameMember } from '@/lib/auth/authorization';
import { queueActionSchema, queueJoinSchema } from '@/lib/validation/api-schemas';
import { getTerminalMemberId } from '@/lib/terminal-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';
import { checkRateLimit } from '@/lib/rate-limit';

async function authorizeQueueRequest(request: Request, memberId?: string) {
  if (checkControllerKey(request)) return { supabase: createAdminClient(), response: undefined };
  const controllerDevice = await authenticateControllerDevice(request, 'kiosk');
  if (controllerDevice) return { supabase: createAdminClient(), response: undefined };
  const terminalMemberId = getTerminalMemberId(request.headers.get('x-terminal-token'), memberId);
  if (terminalMemberId) return { supabase: createAdminClient(), response: undefined, terminalMemberId };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (memberId && !hasStaffRole(user) && !isSameMember(user, memberId)) {
    return { supabase, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { supabase, response: undefined };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId');

  if (memberId) {
    const auth = await authorizeQueueRequest(request, memberId);
    if (auth.response) return auth.response;
    const supabase = auth.supabase;
    const { data: entries } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('member_id', memberId)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: false });

    if (entries && entries.length > 0) {
      const enriched = await Promise.all(entries.map(async (e) => {
        const pos = await getQueuePosition(e.id);
        return { ...e, position: pos, estimatedWait: getEstimatedWait(pos) };
      }));
      return NextResponse.json(enriched);
    }
    return NextResponse.json(entries ?? []);
  }

  return NextResponse.json({ error: 'memberId parameter required' }, { status: 400 });
}

export async function POST(request: Request) {
  const body = await request.json();
  const result = queueJoinSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const auth = await authorizeQueueRequest(request, result.data.memberId);
  if (auth.response) return auth.response;

  // Protect against accidental duplicate taps without locking a member out
  // after a failed request (for example while a schema migration is pending).
  if (!checkRateLimit(`queue:${result.data.memberId}`, 5_000)) {
    return NextResponse.json({ error: 'Too many requests. Please wait a few seconds.' }, { status: 429 });
  }

  try {
    const supabase = auth.supabase;
    const now = new Date();
    
    // Intercept check-ins for Scheduled games to prevent double-booking or false queuing
    // Window matches evaluateRfidScan in reservation-policy.ts
    const SCHEDULE_EARLY_CHECKIN_MIN = 30;
    const SCHEDULE_LATE_CHECKIN_MIN = 15;
    const checkInStart = new Date(now.getTime() - SCHEDULE_EARLY_CHECKIN_MIN * 60_000);
    const checkInEnd = new Date(now.getTime() + SCHEDULE_LATE_CHECKIN_MIN * 60_000);

    const { data: upcomingGames } = await supabase
      .from('games')
      .select('id, court_id, courts(name)')
      .eq('status', 'Scheduled')
      .gte('start_time', checkInStart.toISOString())
      .lte('start_time', checkInEnd.toISOString());

    if (upcomingGames && upcomingGames.length > 0) {
      // Find one where the member is a player
      for (const game of upcomingGames) {
        const { data: isPlayer } = await supabase
          .from('game_players')
          .select('id')
          .eq('game_id', game.id)
          .eq('member_id', result.data.memberId)
          .single();
          
        if (isPlayer) {
          // This is a check-in! Start the game immediately.
          await supabase.from('games').update({ 
            status: 'In Progress', 
            start_time: now.toISOString() 
          }).eq('id', game.id);
          
          // Fire-and-forget: publish board update and displays without blocking
          import('@/lib/display/publish-all').then(m => m.publishAllDisplays().catch(console.error));
          
          return NextResponse.json({ 
            status: 'completed', 
            id: game.id, 
            court_name: (game.courts as any)?.[0]?.name ?? (game.courts as any)?.name ?? null 
          }, { status: 201 });
        }
      }
    }

    // Otherwise, it's a standard walk-in / waitlist join
    const entry = await joinQueue({
      memberId: result.data.memberId,
      start: new Date(result.data.start),
      duration: result.data.duration,
      partySize: result.data.partySize,
      playerIds: result.data.playerIds,
      courtId: result.data.courtId,
      matchTitle: result.data.matchTitle,
    });

    if (entry.status === 'completed' && entry.court_id) {
      const supabase = auth.supabase;
      const { data: court } = await supabase.from('courts').select('name').eq('id', entry.court_id).single();
      return NextResponse.json({ ...entry, court_name: court?.name ?? null }, { status: 201 });
    }

    if (entry.status === 'waiting') {
      const position = await getQueuePosition(entry.id);
      return NextResponse.json({ ...entry, position, estimatedWait: getEstimatedWait(position) }, { status: 201 });
    }

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message === 'Member not active' || message === 'Already in queue' ? 409 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const result = queueActionSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id, action } = result.data;

  const controllerRequest = checkControllerKey(request);
  const auth = await authorizeQueueRequest(request);
  if (auth.response) return auth.response;
  if (!controllerRequest) {
    const { data: entry } = await auth.supabase
      .from('queue_entries')
      .select('member_id')
      .eq('id', id)
      .single();
    if (!entry) return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
    const ownerAuth = await authorizeQueueRequest(request, entry.member_id);
    if (ownerAuth.response) return ownerAuth.response;
  }

  try {
    if (action === 'accept') {
      const res = await finalizeBooking(id);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      const supabase = auth.supabase;
      const { data: entry } = await supabase.from('queue_entries').select('court_id').eq('id', id).single();
      let courtName = null;
      if (entry?.court_id) {
        const { data: court } = await supabase.from('courts').select('name').eq('id', entry.court_id).single();
        courtName = court?.name;
      }
      return NextResponse.json({ success: true, courtName }, { status: 200 });
    }

    await declineOffer(id);
    await publishBoardOnce();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
