import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishDisplay } from '@/lib/mqtt';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {

  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase.from('games').select('status').eq('id', id).single();
  if (!game || game.status !== 'Scheduled')
    return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });

  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {

  const { id } = await params;
  const supabase = await createClient();

  const { data: game } = await supabase
    .from('games')
    .select('*, courts(*), game_players(*, members(*))')
    .eq('id', id)
    .single();

  if (!game || game.status !== 'Scheduled')
    return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });

  // Fix #6: check each update independently so partial failure is caught
  const { error: gameErr } = await supabase
    .from('games')
    .update({ status: 'In Progress', start_time: new Date().toISOString() })
    .eq('id', id);

  if (gameErr) return NextResponse.json({ error: 'Failed to start game' }, { status: 500 });

  const { error: courtErr } = await supabase
    .from('courts')
    .update({ status: 'In Game', last_activity: new Date().toISOString() })
    .eq('id', game.court_id);

  if (courtErr) {
    // Rollback game status so the UI stays consistent
    await supabase.from('games').update({ status: 'Scheduled', start_time: null }).eq('id', id);
    return NextResponse.json({ error: 'Failed to update court' }, { status: 500 });
  }

  const players: string = (game.game_players ?? [])
    .slice(0, 2)
    .map((p: any) => `${p.members?.first_name ?? ''}`.toUpperCase())
    .join(' & ');

  await publishDisplay(game.court_id, {
    line1: (game.courts as any)?.name?.toUpperCase() ?? 'COURT',
    line2: players || game.match_type,
    line3: 'RUNNING',
  });

  return NextResponse.json({ ok: true });
}
