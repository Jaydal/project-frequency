import { NextResponse, NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasStaffRole } from '@/lib/auth/authorization';
import { z } from 'zod';

const actionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('decline'),
    reason: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('approve'),
    paymentReference: z.string({ required_error: 'Proof of payment / payment reference is required' }).trim().min(1, 'Proof of payment / payment reference is required'),
    paymentDetails: z.string().trim().optional(),
    paymentMethod: z.string().trim().optional(),
    amountPaid: z.coerce.number().min(0).optional(),
    adminNotes: z.string().trim().optional(),
  }),
]);

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    
    if (!user || !hasStaffRole(user)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();

    if (body.action === 'approve' && (!body.paymentReference || typeof body.paymentReference !== 'string' || !body.paymentReference.trim())) {
      return NextResponse.json({ error: 'Proof of payment (reference number or payment details) is required' }, { status: 400 });
    }

    const input = actionSchema.safeParse(body);
    
    if (!input.success) {
      const errorMsg = input.error.issues?.[0]?.message || 'Invalid action or missing payment proof';
      return NextResponse.json({ error: errorMsg, details: input.error.flatten() }, { status: 400 });
    }

    const admin = createAdminClient();
    
    if (input.data.action === 'decline') {
      const { error } = await admin
        .from('guest_booking_requests')
        .update({ status: 'Declined' })
        .eq('id', id);
        
      if (error) throw error;
      return NextResponse.json({ success: true, status: 'Declined' });
    }
    
    // Approval Flow (Without RPC to avoid remote DB deployment issues for now)
    const { data: requestRecord, error: fetchErr } = await admin
      .from('guest_booking_requests')
      .select('*')
      .eq('id', id)
      .single();
      
    if (fetchErr || !requestRecord) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    
    if (requestRecord.status !== 'Pending Confirmation') {
      return NextResponse.json({ error: 'Request is no longer pending' }, { status: 400 });
    }

    // Check for double-booking before approving
    const { isSlotAvailable } = await import('@/lib/queue/booking-engine');
    const start = new Date(requestRecord.start_time);
    const end = new Date(start.getTime() + requestRecord.duration * 60_000);
    const available = await isSlotAvailable(requestRecord.court_id, start, end, undefined, admin, id);
    
    if (!available) {
      return NextResponse.json({ error: 'Court is no longer available for this time slot' }, { status: 409 });
    }

    // Insert into games
    const chargeAmount = input.data.amountPaid !== undefined 
      ? input.data.amountPaid 
      : 0;

    const { data: game, error: gameErr } = await admin
      .from('games')
      .insert({
        court_id: requestRecord.court_id,
        match_type: requestRecord.party_size === 4 ? '2v2' : '1v1',
        match_title: requestRecord.match_title || `Guest: ${requestRecord.guest_name}`,
        duration: requestRecord.duration,
        status: 'Scheduled',
        start_time: requestRecord.start_time,
        charge_amount: chargeAmount,
      })
      .select('id')
      .single();

    if (gameErr || !game) {
      return NextResponse.json({ error: 'Failed to create game reservation' }, { status: 500 });
    }

    // Update request with proof of payment details
    const { error: updateErr } = await admin
      .from('guest_booking_requests')
      .update({
        status: 'Confirmed',
        confirmed_game_id: game.id,
        payment_status: 'Confirmed',
        payment_method: input.data.paymentMethod || requestRecord.payment_method,
        payment_reference: input.data.paymentReference.trim(),
        payment_details: input.data.paymentDetails?.trim() || null,
        admin_notes: input.data.adminNotes?.trim() || input.data.paymentDetails?.trim() || null,
        updated_at: new Date().toISOString(),
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      })
      .eq('id', id);

    if (updateErr) {
      // Rollback (best effort)
      await admin.from('games').delete().eq('id', game.id);
      return NextResponse.json({ error: 'Failed to update request status' }, { status: 500 });
    }

    // Update displays with the new booking
    await (await import('@/lib/display/publish-all')).publishAllDisplays();

    return NextResponse.json({ success: true, status: 'Confirmed', gameId: game.id });
  } catch (err: any) {
    console.error('PATCH error:', err);
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
