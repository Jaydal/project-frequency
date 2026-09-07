import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getTerminalMemberId } from '@/lib/terminal-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';
import { processCourtQueue } from '@/lib/queue/queue-processor';
import { publishAllDisplays } from '@/lib/display/publish-all';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  let terminalMemberId = getTerminalMemberId(request.headers.get('x-terminal-token'));

  if (!terminalMemberId && body.memberId) {
    const device = await authenticateControllerDevice(request, 'kiosk');
    const apiKey = request.headers.get('x-api-key');
    const isApiKeyValid = apiKey && apiKey === process.env.CONTROLLER_API_KEY;
    if (device || isApiKeyValid) {
      terminalMemberId = body.memberId;
    }
  }

  if (!terminalMemberId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const requestedGameId = body.gameId as string | undefined;

  const supabase = createAdminClient();

  let gameToCancel: { id: string; court_id: string; status: string } | null = null;

  if (requestedGameId) {
    const { data: game } = await supabase
      .from('games')
      .select('id, court_id, status, game_players(member_id)')
      .eq('id', requestedGameId)
      .maybeSingle();

    if (game) {
      const isPlayer = (game.game_players as Array<{ member_id: string }>)?.some(
        gp => gp.member_id === terminalMemberId
      );
      if (isPlayer) {
        gameToCancel = game;
      }
    }
  }

  // Fallback: Find member's active in-progress game
  if (!gameToCancel) {
    const { data: playerGames } = await supabase
      .from('game_players')
      .select('game_id')
      .eq('member_id', terminalMemberId);

    const gameIds = playerGames?.map(pg => pg.game_id) ?? [];
    if (gameIds.length > 0) {
      const { data: activeGame } = await supabase
        .from('games')
        .select('id, court_id, status')
        .in('id', gameIds)
        .eq('status', 'In Progress')
        .maybeSingle();

      if (activeGame) {
        gameToCancel = activeGame;
      }
    }
  }

  if (!gameToCancel) {
    return NextResponse.json({ error: 'No active game found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  // Complete / End the ongoing game
  const { error: gameErr } = await supabase
    .from('games')
    .update({
      status: 'Completed',
      end_time: now,
      ended_at: now,
    })
    .eq('id', gameToCancel.id);

  if (gameErr) {
    return NextResponse.json({ error: gameErr.message }, { status: 500 });
  }

  // Free the court and advance any queued players
  if (gameToCancel.court_id) {
    await supabase
      .from('courts')
      .update({
        status: 'Available',
        last_activity: now,
      })
      .eq('id', gameToCancel.court_id);

    await processCourtQueue(gameToCancel.court_id);
  }

  // Refresh LED matrix displays and kiosk MQTT boards
  await publishAllDisplays().catch(console.error);

  return NextResponse.json({ ok: true, gameId: gameToCancel.id });
}
