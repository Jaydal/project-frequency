import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasStaffRole } from '@/lib/auth/authorization';
import { guestBookingRequestSchema } from '@/lib/validation/api-schemas';

const HOLD_MINUTES = 30;

export async function POST(request: Request) {
  try {
    const input = guestBookingRequestSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json({ error: 'Please complete all guest booking details.' }, { status: 400 });

    const start = new Date(input.data.start);
    // Allow a 5-minute grace period to prevent rejections due to form submission latency or clock drift
    const GRACE_MS = 5 * 60_000;
    if (start.getTime() < Date.now() - GRACE_MS) {
      return NextResponse.json({ error: 'The selected time must be in the future.' }, { status: 400 });
    }

    // Reverting to the Admin Client to bypass RLS since the database doesn't have an anon policy
    const supabase = createAdminClient();
    const { isSlotAvailable } = await import('@/lib/queue/booking-engine');
    const end = new Date(start.getTime() + input.data.duration * 60_000);
    const available = await isSlotAvailable(input.data.courtId, start, end);
    
    if (!available) {
      return NextResponse.json({ error: 'This time slot is no longer available. Please choose another.' }, { status: 409 });
    }

    const referenceCode = `PP-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60_000).toISOString();
    
    const { data, error } = await supabase.from('guest_booking_requests').insert({
      guest_name: input.data.guestName,
      mobile_number: input.data.mobileNumber,
      email: input.data.email ?? '',
      court_id: input.data.courtId,
      start_time: start.toISOString(),
      duration: input.data.duration,
      party_size: input.data.partySize,
      match_title: input.data.matchTitle ?? '',
      payment_method: input.data.paymentMethod,
      reference_code: referenceCode,
      hold_expires_at: holdExpiresAt,
      status: 'Pending Confirmation'
    }).select().single();
    
    if (error) {
      console.error('Guest booking request DB insert error:', error);
      return NextResponse.json({ error: 'Unable to hold this time. Please try again.' }, { status: 409 });
    }
    return NextResponse.json({ referenceCode, holdExpiresAt: data.hold_expires_at, status: data.status }, { status: 201 });
  } catch (err) {
    console.error('Guest booking request error:', err);
    return NextResponse.json({ error: 'Guest booking requests are temporarily unavailable.' }, { status: 503 });
  }
}

export async function GET() {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user || !hasStaffRole(user)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const admin = createAdminClient();
  const { data, error } = await admin.from('guest_booking_requests').select('*, courts(name)').in('status', ['Pending Confirmation', 'Expired']).order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
