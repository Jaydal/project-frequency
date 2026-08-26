import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdvancedBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get('memberId') ?? user.id;
  const date = searchParams.get('date') ?? undefined;

  const bookings = await getUpcomingBookings(memberId, date);
  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const result = await createAdvancedBooking({
      memberId: body.memberId ?? user.id,
      courtId: body.courtId,
      start: body.start,
      duration: body.duration,
      partySize: body.partySize,
      playerIds: body.playerIds,
      matchTitle: body.matchTitle,
    });

    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.booking, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
