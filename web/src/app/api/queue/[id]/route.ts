import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { publishAllDisplays } from '@/lib/display/publish-all';
import { hasMatchingApiKey } from '@/lib/auth/authorization';
import { hasStaffRole, isSameMember } from '@/lib/auth/authorization';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';
import { getTerminalMemberId } from '@/lib/terminal-auth';
import { leaveQueue } from '@/lib/queue/queue-service';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {

  const { id } = await params;

  const internalAuthorized = hasMatchingApiKey(request.headers.get('x-api-key'), process.env.INTERNAL_API_KEY);
  const controllerDevice = await authenticateControllerDevice(request, 'kiosk');
  const terminalMemberId = getTerminalMemberId(request.headers.get('x-terminal-token'));

  let supabase;
  let user = null;
  if (internalAuthorized || controllerDevice || terminalMemberId) {
    supabase = createAdminClient();
  } else {
    supabase = await createClient();
    const authResult = await (supabase as any).auth?.getUser?.();
    user = authResult?.data?.user ?? null;
  }
  const staffAuthorized = hasStaffRole(user);

  if (!internalAuthorized && !controllerDevice && !terminalMemberId && !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: queueEntry } = await supabase
    .from('queue_entries')
    .select('id, member_id, status')
    .eq('id', id)
    .maybeSingle();

  if (queueEntry) {
    if (!internalAuthorized && !controllerDevice && !staffAuthorized && !terminalMemberId && !isSameMember(user, queueEntry.member_id)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (terminalMemberId && terminalMemberId !== queueEntry.member_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (!['waiting', 'offered'].includes(queueEntry.status)) {
      return NextResponse.json({ error: 'Queue entry cannot be cancelled' }, { status: 409 });
    }
    await leaveQueue(id);
    return NextResponse.json({ ok: true, cancelled: 'queue_entry' });
  }

  if (!internalAuthorized && !staffAuthorized) {
    return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });
  }

  const { data: game } = await supabase.from('games').select('status, court_id').eq('id', id).single();
  if (!game || game.status !== 'Scheduled')
    return NextResponse.json({ error: 'Queue entry not found' }, { status: 404 });

  const { error } = await supabase.from('games').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Delete failed' }, { status: 500 });

  if (game.court_id) {
    await supabase.from('courts').update({ status: 'Available' }).eq('id', game.court_id);
    await publishAllDisplays();
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {

  if (!hasMatchingApiKey(_request.headers.get('x-api-key'), process.env.INTERNAL_API_KEY)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const playerStr = (game.game_players ?? [])
    .map((p: any) => `${p.members?.first_name ?? ''} ${p.members?.last_name ?? ''}`.trim())
    .join(', ');

  await publishAllDisplays();

  return NextResponse.json({ ok: true });
}
