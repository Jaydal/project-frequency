import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureConnected, getDisplayState, getCourtStatus, isBrokerConnected } from '@/lib/mqtt';
import { effectivePrepSec } from '@/lib/products-config-types';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courtId: string }> },
) {
  const { courtId } = await params;
  ensureConnected();

  for (let i = 0; i < 50; i++) {
    if (isBrokerConnected()) break;
    await new Promise(r => setTimeout(r, 100));
  }

  let display = getDisplayState(courtId);
  let gameInfo: { startTime: string; duration: number; prepTimeSec: number } | null = null;

  if (!display) {
    const supabase = await createClient();
    const { data: game } = await supabase
      .from('games')
      .select('id, match_type, match_title, status, duration, start_time, courts!inner(name)')
      .eq('court_id', courtId)
      .eq('status', 'In Progress')
      .order('start_time', { ascending: false })
      .limit(1)
      .single();

    if (game) {
      const { data: settings } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'preparationTime')
        .single();
      const rawPrep = parseInt(settings?.value ?? '300', 10);
      const prepTimeSec = isNaN(rawPrep) ? 300 : rawPrep;

      display = {
        line1: (game as any).courts?.name?.toUpperCase() ?? '',
        line2: game.match_title ?? `${game.match_type} · ${game.duration}min`,
        line3: 'IN PROGRESS',
      };
      gameInfo = { startTime: game.start_time, duration: game.duration, prepTimeSec };
    }
  }

  if (!display) {
    const supabase = await createClient();
    const { data: court } = await supabase
      .from('courts')
      .select('name')
      .eq('id', courtId)
      .single();

    display = {
      line1: court?.name?.toUpperCase() ?? '',
      line2: 'NO ACTIVE',
      line3: 'GAME',
    };
  }

  const status = getCourtStatus(courtId);

  return NextResponse.json({
    courtId,
    display,
    status: status ?? null,
    game: gameInfo,
  });
}
