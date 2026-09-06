import { createClient } from '@/lib/supabase/server';
import type { QueueEntry } from './index';
import { findAvailableCourt, isSlotAvailable } from './booking-engine';
import { publishAllDisplays } from '@/lib/display/publish-all';
import { processCourtQueue, processAllCourts } from './queue-processor';
import { getCost, ProductsConfig } from '@/lib/products-config-types';

export interface JoinQueueParams {
  memberId: string;
  start: Date;
  duration: number;
  partySize: number;
  playerIds: string[];
  courtId?: string;
  matchTitle?: string;
}

async function getRates(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Record<string, number>> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'prices').single();
  return data?.value ? JSON.parse(data.value) : { '30': 150, '60': 300, '90': 450 };
}

function calcCharge(rates: Record<string, number>, duration: number, partySize: number): number {
  const config: ProductsConfig = { matchTypes: [], durations: [], rates, };
  const cost = getCost(config, duration, partySize);
  if (cost === 0) throw new Error(`No price configured for ${duration} min`);
  return cost;
}

export async function deductWallet(memberId: string, amount: number, gameId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('member_id', memberId)
    .single();
  if (!wallet) throw new Error('Wallet not found');
  if (wallet.balance < amount) throw new Error('Insufficient credits');

  const { data: updated } = await supabase
    .from('wallets')
    .update({ balance: wallet.balance - amount })
    .eq('id', wallet.id)
    .eq('balance', wallet.balance)
    .select()
    .single();
  if (!updated) throw new Error('Concurrent wallet update, try again');

  const { data: tx } = await supabase
    .from('wallet_transactions')
    .insert({
      wallet_id: wallet.id,
      amount: -amount,
      type: 'game_fee',
      reference_number: gameId,
    })
    .select('id')
    .single();
  return tx?.id ?? null;
}

// Refund a specific wallet transaction (credit balance + log a Refund row).
// Idempotent: a Refund row with reference_number `refund-<txId>` can only exist once.
export async function refundTransaction(txId: string, remarks: string): Promise<void> {
  const supabase = await createClient();
  const { data: tx } = await supabase
    .from('wallet_transactions')
    .select('id, wallet_id, amount')
    .eq('id', txId)
    .single();
  if (!tx) return;

  const amount = Math.abs(Number(tx.amount));
  if (!amount || amount <= 0) return;

  const ref = `refund-${tx.id}`;
  const { data: existing } = await supabase
    .from('wallet_transactions')
    .select('id')
    .eq('type', 'Refund')
    .eq('reference_number', ref)
    .limit(1);
  if (existing && existing.length > 0) return;

  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('id', tx.wallet_id)
    .single();
  if (!wallet) return;

  const { data: updated } = await supabase
    .from('wallets')
    .update({ balance: wallet.balance + amount })
    .eq('id', wallet.id)
    .eq('balance', wallet.balance)
    .select()
    .single();
  if (!updated) throw new Error('Concurrent wallet update, try again');

  await supabase.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    amount,
    type: 'Refund',
    reference_number: ref,
    remarks,
  });
}

export async function joinQueue(params: JoinQueueParams): Promise<QueueEntry> {
  const supabase = await createClient();

  // Run independent checks in parallel to reduce round trips
  const [memberRes, ratesRes] = await Promise.all([
    supabase.from('members').select('status').eq('id', params.memberId).single(),
    getRates(supabase),
  ]);

  if (!memberRes.data || memberRes.data.status !== 'Active') throw new Error('Member not active');

  const rates = ratesRes;
  const charge = calcCharge(rates, params.duration, params.partySize);
  const isScheduled = params.start.getTime() > Date.now() + 30_000;

  // Future bookings remain scheduled until the queue processor reaches their
  // start time. This prevents a scheduled booking from occupying a court now.
  if (isScheduled) {
    let scheduledCourt = null;
    if (params.courtId) {
      const { data: selected } = await supabase
        .from('courts')
        .select('id, name, status')
        .eq('id', params.courtId)
        .single();
      if (selected && await isSlotAvailable(selected.id, params.start, new Date(params.start.getTime() + params.duration * 60_000))) {
        scheduledCourt = selected;
      }
    } else {
      scheduledCourt = await findAvailableCourt(params.start, params.duration, params.partySize);
    }
    if (!scheduledCourt) throw new Error('Selected time is no longer available');

    const insertData: Record<string, any> = {
      member_id: params.memberId,
      requested_start: params.start.toISOString(),
      duration: params.duration,
      party_size: params.partySize,
      player_ids: JSON.stringify(params.playerIds),
      status: 'scheduled',
      court_id: scheduledCourt.id,
    };
    if (params.matchTitle) insertData.match_title = params.matchTitle;
    const depositTxId = await deductWallet(params.memberId, charge, `QUEUE_DEPOSIT_${Date.now()}`);
    if (depositTxId) insertData.deposit_tx_id = depositTxId;
    const { data: entry, error } = await supabase.from('queue_entries').insert(insertData).select().single();
    if (error) {
      if (depositTxId) await refundTransaction(depositTxId, 'Scheduled booking failed');
      throw new Error(error.message);
    }
    publishAllDisplays().catch(console.error);
    return entry as QueueEntry;
  }

  // Always attempt to book a free court directly. A waiting entry for a DIFFERENT
  // court must NOT block booking a currently free court — otherwise a caller who
  // picks an available court while another court has a waiter would be wrongly
  // pushed into the queue (leaving the free court unused). When no court is
  // specified we pick any free court via findAvailableCourt.
  let court = null;

  if (params.courtId) {
    await processCourtQueue(params.courtId);
    const { data: selected } = await supabase
      .from('courts')
      .select('id, name, status')
      .eq('id', params.courtId)
      .single();
    if (selected) {
      const now = new Date();
      const slotFree = await isSlotAvailable(selected.id, now, new Date(now.getTime() + params.duration * 60_000));
      if (slotFree) court = selected;
    }
  } else {
    await processAllCourts();
    court = await findAvailableCourt(params.start, params.duration, params.partySize);
  }

  if (court) {
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        court_id: court.id,
        match_type: params.partySize === 4 ? '2v2' : '1v1',
        match_title: params.matchTitle ?? null,
        duration: params.duration,
        status: 'In Progress',
        start_time: new Date().toISOString(),
        charge_amount: charge,
      })
      .select()
      .single();

    if (gameErr) throw new Error(gameErr.message);

    // Batch insert all game_players in one query
    const { error: gpErr } = await supabase
      .from('game_players')
      .insert(params.playerIds.map(pid => ({ game_id: game.id, member_id: pid, team: null })));
    if (gpErr) throw new Error(gpErr.message);

    const { error: courtErr } = await supabase
      .from('courts')
      .update({ status: 'In Game', last_activity: new Date().toISOString() })
      .eq('id', court.id);
    if (courtErr) throw new Error(courtErr.message);

    await deductWallet(params.memberId, charge, game.id);

    // Fire-and-forget: publish board update without blocking the response
    publishAllDisplays().catch(console.error);

    return {
      id: game.id,
      member_id: params.memberId,
      requested_start: params.start.toISOString(),
      duration: params.duration,
      party_size: params.partySize,
      player_ids: params.playerIds,
      court_id: court.id,
      status: 'completed',
      expires_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as QueueEntry;
  }

  // Join the queue
  const insertData: Record<string, any> = {
    member_id: params.memberId,
    requested_start: params.start.toISOString(),
    duration: params.duration,
    party_size: params.partySize,
    player_ids: JSON.stringify(params.playerIds),
    status: 'waiting',
  };
  if (params.courtId) insertData.court_id = params.courtId;
  if (params.matchTitle) insertData.match_title = params.matchTitle;

  // Deduct wallet upfront for joining the queue
  const depositTxId = await deductWallet(params.memberId, charge, "QUEUE_DEPOSIT_" + Date.now().toString());
  if (depositTxId) insertData.deposit_tx_id = depositTxId;

  const { data: entry, error } = await supabase
    .from('queue_entries')
    .insert(insertData)
    .select()
    .single();
  
  if (error) {
    // Refund the deposit if insertion failed
    if (depositTxId) await refundTransaction(depositTxId, 'Queue join failed');
    throw new Error(error.message);
  }

  // Fire-and-forget: publish board update and displays without blocking
  publishAllDisplays().catch(console.error);

  return entry as QueueEntry;
}

export async function leaveQueue(entryId: string): Promise<void> {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('id, deposit_tx_id, court_id')
    .eq('id', entryId)
    .single();
  if (!entry) return;

  if (entry.deposit_tx_id) {
    await refundTransaction(entry.deposit_tx_id, 'Queue entry cancelled');
  }

  await supabase
    .from('queue_entries')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', entryId);

  if (entry.court_id) {
    await processCourtQueue(entry.court_id);
  }
  await publishAllDisplays();
}

export async function getQueuePosition(entryId: string): Promise<number> {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('created_at, status')
    .eq('id', entryId)
    .single();
  if (!entry) return 0;
  const { count } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
      .eq('status', entry.status)
    .lt('created_at', entry.created_at);
  return count ?? 0;
}

export function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * 30;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}
