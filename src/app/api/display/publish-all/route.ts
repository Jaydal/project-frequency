import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishDisplay } from '@/lib/mqtt';
import { generatePayload } from '@/lib/display/sports-caster';
import { publishBoardOnce } from '@/lib/queue/board-publisher';

export async function POST() {
  const supabase = await createClient();

  const { data: courts } = await supabase.from('courts').select('*').order('name');
  const { data: games } = await supabase.from('games').select('*, courts!inner(name)').in('status', ['In Progress', 'Scheduled']).order('start_time', { ascending: false });
  const { data: queue } = await supabase.from('queue_entries').select('*, members(first_name)').eq('status', 'waiting').order('created_at', { ascending: true });

  const gameByCourt = new Map<string, any>();
  (games ?? []).forEach((g: any) => gameByCourt.set(g.court_id, g));

  for (const court of courts ?? []) {
    const game = gameByCourt.get(court.id);
    
    let current = null;
    if (game) {
      current = {
        name: game.match_title || game.match_type || 'MATCH',
        startTime: game.start_time || new Date().toISOString(),
        durationMinutes: game.duration
      };
    }

    const upcoming = (queue ?? []).map(q => ({
       name: q.match_title || `Waiting Team`
    }));

    const payload = generatePayload(court.id, { current, upcoming });
    await publishDisplay(court.id, payload);
  }

  await publishBoardOnce();

  return NextResponse.json({ ok: true, courts: courts?.length ?? 0 });
}
