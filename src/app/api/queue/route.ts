import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { joinQueue, getQueuePosition, getEstimatedWait } from '@/lib/queue/queue-service';
import { acceptOffer, declineOffer } from '@/lib/queue/reservation-service';
import { publishBoardOnce } from '@/lib/queue/board-publisher';
import { z } from 'zod';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId');

  if (memberId) {
    const supabase = await createClient();
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

const joinSchema = z.object({
  memberId: z.string().uuid(),
  start: z.string(),
  duration: z.number().int().positive(),
  partySize: z.union([z.literal(2), z.literal(4)]),
  playerIds: z.array(z.string().uuid()).min(1).max(4),
  courtId: z.string().uuid().optional(),
  matchTitle: z.string().optional(),
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = joinSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  try {
    const entry = await joinQueue({
      memberId: result.data.memberId,
      start: new Date(result.data.start),
      duration: result.data.duration,
      partySize: result.data.partySize,
      playerIds: result.data.playerIds,
      courtId: result.data.courtId,
      matchTitle: result.data.matchTitle,
    });

    // Push the updated board to the firmware kiosk (setInterval publishing is
    // unreliable in Next/serverless, so we publish on every mutation instead).
    await publishBoardOnce();

    if (entry.status === 'completed' && entry.court_id) {
      const supabase = await createClient();
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

const actionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
});

export async function PATCH(request: Request) {
  const body = await request.json();
  const result = actionSchema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { id, action } = result.data;

  try {
    // publish the refreshed board after the accept/decline mutation runs
    const publishAfter = async () => { await publishBoardOnce(); };
    if (action === 'accept') {
      const res = await acceptOffer(id);
      if (!res.success) {
        return NextResponse.json({ error: res.error }, { status: 400 });
      }
      const supabase = await createClient();
      const { data: entry } = await supabase.from('queue_entries').select('court_id').eq('id', id).single();
      let courtName = null;
      if (entry?.court_id) {
        const { data: court } = await supabase.from('courts').select('name').eq('id', entry.court_id).single();
        courtName = court?.name;
      }
      await publishAfter();
      return NextResponse.json({ success: true, courtName }, { status: 200 });
    }

    const supabase = await createClient();
    const { data: entry } = await supabase.from('queue_entries').select('court_id').eq('id', id).single();
    await declineOffer(id, entry?.court_id ?? null);
    await publishAfter();
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
