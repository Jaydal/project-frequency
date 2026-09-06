import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdvancedBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';
import { hasStaffRole, isSameMember } from '@/lib/auth/authorization';
import { bookingSchema } from '@/lib/validation/api-schemas';
import { checkRateLimit } from '@/lib/rate-limit';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const requestedMemberId = searchParams.get('memberId');
  if (requestedMemberId && !hasStaffRole(user) && !isSameMember(user, requestedMemberId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const memberId = requestedMemberId ?? user.id;
  const dateStr = searchParams.get('date');
  let date: string | undefined = undefined;
  if (dateStr) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return NextResponse.json({ error: 'Invalid date format, expected YYYY-MM-DD' }, { status: 400 });
    }
    date = dateStr;
  }

  const bookings = await getUpcomingBookings(memberId, date);
  return NextResponse.json(bookings);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const terminalToken = request.headers.get('x-terminal-token');

  if (!user && !terminalToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const input = bookingSchema.safeParse({ ...body, memberId: body.memberId ?? user?.id });
    if (!input.success) {
      return NextResponse.json({ error: 'Invalid payload', details: input.error.flatten() }, { status: 400 });
    }
    
    let authenticatedMemberId = user?.id;
    
    // Check terminal token if no valid user
    if (!authenticatedMemberId) {
      const { getTerminalMemberId } = await import('@/lib/terminal-auth');
      const tokenMemberId = getTerminalMemberId(request.headers.get('x-terminal-token'), input.data.memberId);
      if (tokenMemberId) {
        authenticatedMemberId = tokenMemberId;
      }
    }

    if (!authenticatedMemberId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const memberKey = input.data.memberId ?? authenticatedMemberId;

    if (!hasStaffRole(user) && !isSameMember(user, input.data.memberId) && authenticatedMemberId !== input.data.memberId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!checkRateLimit(`booking:${memberKey}`)) {
      return NextResponse.json({ error: 'Too many booking requests. Please wait 60 seconds.' }, { status: 429 });
    }

    const effectivePlayerIds = input.data.playerIds && input.data.playerIds.length > 0
      ? input.data.playerIds
      : [input.data.memberId];

    const result = await createAdvancedBooking({
      ...input.data,
      playerIds: effectivePlayerIds,
    });

    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    
    // Fire-and-forget: update the physical kiosk and LED scoreboards
    import('@/lib/display/publish-all').then(m => m.publishAllDisplays().catch(console.error));
    
    return NextResponse.json(result.booking, { status: 201 });
  } catch (err) {
    console.error('Advanced booking failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
