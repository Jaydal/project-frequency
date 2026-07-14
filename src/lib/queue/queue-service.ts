import { createClient } from '@/lib/supabase/server';
import type { QueueEntry } from './index';
import { findAvailableCourt, isSlotAvailable } from './booking-engine';
import { publishDisplay } from '@/lib/mqtt';
import { generatePayload } from '@/lib/display/sports-caster';

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
  const rate = rates[String(duration)];
  if (!rate) throw new Error(`No price configured for ${duration} min`);
  return Math.round((rate * (duration / 30)) / (partySize === 4 ? 2 : 1));
}

async function deductWallet(memberId: string, amount: number, gameId: string): Promise<void> {
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

  await supabase.from('wallet_transactions').insert({
    wallet_id: wallet.id,
    amount: -amount,
    type: 'game_fee',
    reference_number: gameId,
  });
}

async function refundWallet(memberId: string, amount: number, gameId: string, remarks: string): Promise<void> {
  const supabase = await createClient();
  const { data: wallet } = await supabase
    .from('wallets')
    .select('id, balance')
    .eq('member_id', memberId)
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
    reference_number: gameId,
    remarks,
  });
}

export async function joinQueue(params: JoinQueueParams): Promise<QueueEntry> {
  const supabase = await createClient();

  // Run independent checks in parallel to reduce round trips
  const [memberRes, existingQueueRes, ratesRes, waitingRes] = await Promise.all([
    supabase.from('members').select('status').eq('id', params.memberId).single(),
    supabase.from('queue_entries').select('id').eq('member_id', params.memberId).in('status', ['waiting', 'offered']).limit(1),
    getRates(supabase),
    supabase.from('queue_entries').select('*', { count: 'exact', head: true }).eq('status', 'waiting'),
  ]);

  if (!memberRes.data || memberRes.data.status !== 'Active') throw new Error('Member not active');
  if (existingQueueRes.data && existingQueueRes.data.length > 0) throw new Error('Already in queue');

  const rates = ratesRes;
  const charge = calcCharge(rates, params.duration, params.partySize);
  const waitingCount = waitingRes.count;

  if (!waitingCount || waitingCount === 0) {
    let court = null;

    if (params.courtId) {
      const { data: selected } = await supabase
        .from('courts')
        .select('id, name, status')
        .eq('id', params.courtId)
        .single();
      if (selected && selected.status === 'Available') {
        const slotFree = await isSlotAvailable(selected.id, params.start, new Date(params.start.getTime() + params.duration * 60_000));
        if (slotFree) court = selected;
      }
    }

    if (!court) {
      court = await findAvailableCourt(params.start, params.duration, params.partySize, params.courtId);
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
      publishDisplay(court.id, generatePayload(court.id, {
        current: { name: params.matchTitle || `${params.partySize === 4 ? '2v2' : '1v1'}`, startTime: new Date().toISOString(), durationMinutes: params.duration },
        upcoming: []
      }));

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

  const { data: entry, error } = await supabase
    .from('queue_entries')
    .insert(insertData)
    .select()
    .single();
  if (error) throw new Error(error.message);

  return entry as QueueEntry;
}

export async function leaveQueue(entryId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('queue_entries')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', entryId);
}

export async function getQueuePosition(entryId: string): Promise<number> {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('created_at')
    .eq('id', entryId)
    .single();
  if (!entry) return 0;
  const { count } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .lt('created_at', entry.created_at);
  return count ?? 0;
}

export function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * 30;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}
