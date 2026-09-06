import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelBooking } from '@/lib/queue/advanced-booking';
import { hasStaffRole } from '@/lib/auth/authorization';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  if (!hasStaffRole(user)) {
    const [{ data: participant }, { data: queueEntry }] = await Promise.all([
      supabase.from('game_players').select('id').eq('game_id', id).eq('member_id', user.id).maybeSingle(),
      supabase.from('queue_entries').select('id').eq('id', id).eq('member_id', user.id).maybeSingle(),
    ]);
    if (!participant && !queueEntry) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data: isGame } = await supabase.from('games').select('id').eq('id', id).maybeSingle();

  const result = await cancelBooking(id, !!isGame);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });

  // Fire-and-forget: update displays
  import('@/lib/display/publish-all').then(m => m.publishAllDisplays().catch(console.error));

  return NextResponse.json({ success: true, refunded: result.refunded });
}
