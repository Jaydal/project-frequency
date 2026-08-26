import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { cancelBooking } from '@/lib/queue/advanced-booking';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (body.action !== 'cancel') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const { data: isGame } = await supabase.from('games').select('id').eq('id', params.id).maybeSingle();

  const result = await cancelBooking(params.id, !!isGame);
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ success: true, refunded: result.refunded });
}
