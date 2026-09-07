import { createAdminClient } from '@/lib/supabase/admin';
import { deductWallet, refundTransaction } from './queue-service';
import { isSlotAvailable } from './booking-engine';
import { getCost } from '../products-config-types';

const MAX_ADVANCE_DAYS = 7;
const CANCEL_REFUND_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

export interface CreateBookingInput {
  memberId: string;
  courtId?: string;
  start: string;
  duration: number;
  partySize: number;
  playerIds: string[];
  matchTitle?: string;
}

export interface BookingResult {
  booking: { id: string; status: string; court_id: string | null };
  error?: string;
}

export async function createAdvancedBooking(input: CreateBookingInput, client?: any): Promise<BookingResult> {
  const supabase = client ?? createAdminClient();
  const start = new Date(input.start);
  const now = new Date();

  if (start.getTime() <= now.getTime()) {
    return { booking: { id: '', status: '', court_id: null }, error: 'Start time must be in the future' };
  }
  if (start.getTime() > now.getTime() + MAX_ADVANCE_DAYS * 24 * 60 * 60 * 1000) {
    return { booking: { id: '', status: '', court_id: null }, error: 'Booking window cannot exceed 7 days' };
  }

  const end = new Date(start.getTime() + input.duration * 60_000);

  let courtId = input.courtId;
  if (!courtId) {
    const { data: courts } = await supabase
      .from('courts')
      .select('id, status')
      .not('status', 'in', '("Maintenance","Closed")');
    for (const c of courts ?? []) {
      const slotFree = await isSlotAvailable(c.id, start, end);
      if (slotFree) { courtId = c.id; break; }
    }
  } else {
    const slotFree = await isSlotAvailable(courtId, start, end);
    if (!slotFree) {
      return { booking: { id: '', status: '', court_id: null }, error: 'Court is not available for the selected time' };
    }
  }

  if (!courtId) {
    return { booking: { id: '', status: '', court_id: null }, error: 'No courts available for the selected time' };
  }

  const { data: pricesRow } = await supabase.from('settings').select('value').eq('key', 'prices').single();
  const defaultRates = { '30': 150, '60': 300, '90': 450 };
  let rates: Record<string, number> = defaultRates;
  try {
    rates = pricesRow?.value ? JSON.parse(pricesRow.value) : defaultRates;
  } catch {
    rates = defaultRates;
  }
  const config = { matchTypes: [], durations: [30, 60, 90], rates };
  const charge = getCost(config, input.duration, input.partySize);
  if (!charge) return { booking: { id: '', status: '', court_id: null }, error: 'No price configured for this duration' };

  let depositTxId: string | null = null;
  try {
    depositTxId = await deductWallet(input.memberId, charge, 'QUEUE_DEPOSIT_' + Date.now());
  } catch (err: any) {
    return { booking: { id: '', status: '', court_id: null }, error: err?.message || 'Insufficient credits' };
  }
  if (!depositTxId) return { booking: { id: '', status: '', court_id: null }, error: 'Insufficient credits' };

  const gameInsert = {
    court_id: courtId,
    match_type: input.partySize === 4 ? '2v2' : '1v1',
    match_title: input.matchTitle ?? null,
    duration: input.duration,
    status: 'Scheduled',
    start_time: start.toISOString(),
    charge_amount: charge,
  };

  const { data: game, error: gameErr } = await supabase.from('games').insert(gameInsert).select().single();
  if (gameErr || !game) {
    await refundTransaction(depositTxId, 'Booking creation failed');
    return { booking: { id: '', status: '', court_id: null }, error: gameErr?.message ?? 'Failed to create booking' };
  }

  await supabase.from('game_players').insert(
    input.playerIds.map(pid => ({ game_id: game.id, member_id: pid, team: null }))
  );

  return { booking: { id: game.id, status: 'Scheduled', court_id: courtId } };
}

export async function cancelBooking(bookingId: string, isGame: boolean, client?: any): Promise<{ success: boolean; refunded: boolean; error?: string }> {
  const supabase = client ?? createAdminClient();

  if (isGame) {
    const { data: game } = await supabase.from('games').select('start_time, charge_amount').eq('id', bookingId).single();
    if (!game) return { success: false, refunded: false, error: 'Booking not found' };

    const now = new Date();
    const start = new Date(game.start_time);
    const canRefund = now.getTime() < start.getTime() - CANCEL_REFUND_THRESHOLD_MS;

    await supabase.from('games').update({ status: 'Cancelled' }).eq('id', bookingId);
    if (canRefund && game.charge_amount > 0) {
      const { data: tx } = await supabase.from('wallet_transactions').select('id').eq('reference_number', bookingId).eq('type', 'game_fee').single();
      if (tx) await refundTransaction(tx.id, 'Booking cancelled >2h before start');
      return { success: true, refunded: true };
    }
    return { success: true, refunded: false };
  }

  const { data: entry } = await supabase.from('queue_entries').select('requested_start, deposit_tx_id, status').eq('id', bookingId).single();
  if (!entry) return { success: false, refunded: false, error: 'Booking not found' };
  if (!['Scheduled', 'waiting'].includes(entry.status)) {
    return { success: false, refunded: false, error: 'Booking cannot be cancelled' };
  }

  const now = new Date();
  const start = new Date(entry.requested_start);
  const canRefund = now.getTime() < start.getTime() - CANCEL_REFUND_THRESHOLD_MS;

  await supabase.from('queue_entries').update({ status: 'cancelled', updated_at: now.toISOString() }).eq('id', bookingId);
  if (canRefund && entry.deposit_tx_id) {
    await refundTransaction(entry.deposit_tx_id, 'Booking cancelled >2h before start');
    return { success: true, refunded: true };
  }
  return { success: true, refunded: false };
}

export interface Game {
  id: string;
  court_id: string;
  match_type: string;
  match_title?: string | null;
  duration: number;
  status: string;
  start_time: string;
  charge_amount: number;
  game_players?: any[];
}

export async function getUpcomingBookings(memberId?: string, date?: string, client?: any): Promise<Game[]> {
  const supabase = client ?? createAdminClient();
  const now = new Date().toISOString();

  let query = supabase.from('games').select('*, game_players(*)').eq('status', 'Scheduled').gte('start_time', now).order('start_time', { ascending: true });
  if (memberId) {
    const { data: entries } = await supabase.from('game_players').select('game_id').eq('member_id', memberId);
    const gameIds = (entries ?? []).map((e: any) => e.game_id);
    query = query.in('id', gameIds);
  }
  if (date) {
    const start = new Date(date + 'T00:00:00Z');
    const end = new Date(date + 'T23:59:59Z');
    query = query.gte('start_time', start.toISOString()).lte('start_time', end.toISOString());
  }

  const { data: games } = await query;
  return games ?? [];
}
