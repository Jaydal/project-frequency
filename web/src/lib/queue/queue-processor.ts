import { createAdminClient } from '@/lib/supabase/admin';
import { isSlotAvailable } from './booking-engine';
import { getCost, ProductsConfig } from '@/lib/products-config-types';
import { evaluateLights } from './light-controller';

export async function processCourtQueue(courtId: string): Promise<boolean> {
  /* Queue reconciliation is invoked by registered kiosk devices and has no
   * browser session. Use the service-role client so RLS cannot silently block
   * completion/promotion after the kiosk reports an expired game. */
  const supabase = createAdminClient();

  const now = new Date();
  const { data: court } = await supabase.from('courts').select('id, name').eq('id', courtId).single();
  if (!court) return false;

  // Check active games for this court
  const { data: activeGames } = await supabase
    .from('games')
    .select('id, duration, start_time, status')
    .eq('court_id', courtId)
    .in('status', ['In Progress', 'Scheduled']);

  let isOccupied = false;
  if (activeGames && activeGames.length > 0) {
    for (const game of activeGames) {
      if (!game.start_time) continue;
      const startMs = new Date(game.start_time).getTime();
      const gameEnd = new Date(startMs + game.duration * 60_000);
      
      // If a Scheduled game's start time is past the current time, it is a no-show ("done already")
      if (game.status === 'Scheduled' && now.getTime() >= startMs) {
        await supabase
          .from('games')
          .update({ status: 'No-show', no_show_at: now.toISOString() })
          .eq('id', game.id);
        continue;
      }

      // If the game's scheduled end time is in the past, auto-complete it
      if (now.getTime() >= gameEnd.getTime()) {
        await supabase
          .from('games')
          .update({ 
            status: 'Completed', 
            end_time: gameEnd.toISOString(),
            ended_at: gameEnd.toISOString() 
          })
          .eq('id', game.id);
        continue;
      }

      // If court is occupied right now by an active game, set occupied flag
      if (now.getTime() >= startMs && now.getTime() < gameEnd.getTime()) {
        isOccupied = true;
      }
    }
  }

  if (isOccupied) return false;

  // Get the oldest waiting/scheduled entries ordered by created_at
  const { data: waiting } = await supabase
    .from('queue_entries')
    .select('*')
    .in('status', ['waiting', 'scheduled'])
    .order('created_at', { ascending: true });

  if (!waiting || waiting.length === 0) {
    await supabase.from('courts').update({ status: 'Available' }).eq('id', courtId);
    return false;
  }

  // Try to match the first compatible waiting entry to this court
  for (const entry of waiting) {
    if (entry.court_id && entry.court_id !== courtId) continue;
    if (entry.requested_start && new Date(entry.requested_start).getTime() > now.getTime()) continue;
    const expectedStatus = entry.status;

    const end = new Date(now.getTime() + entry.duration * 60_000);
    const slotFree = await isSlotAvailable(courtId, now, end, entry.id, supabase);
    if (!slotFree) continue;

    let charge = 0;
    try {
      const { data: pricesRow } = await supabase.from('settings').select('value').eq('key', 'prices').single();
      const rawRates = pricesRow?.value;
      const rates: Record<string, number> = typeof rawRates === 'string'
        ? JSON.parse(rawRates)
        : (rawRates && typeof rawRates === 'object' ? rawRates as Record<string, number> : { '30': 150, '60': 300, '90': 450 });
      const config: ProductsConfig = { matchTypes: [], durations: [], rates };
      charge = getCost(config, entry.duration, entry.party_size);
    } catch {
      charge = 0;
    }
    // Fail closed: never promote a game we cannot charge for
    if (!charge || charge === 0) {
      console.error(`[queue-processor] No price configured for ${entry.duration} min, skipping promotion on ${courtId}`);
      return false;
    }

    const { data: member } = await supabase.from('members').select('status').eq('id', entry.member_id).single();
    if (!member || member.status !== 'Active') continue;

    // Atomically claim the entry so concurrent processors cannot double-book it
    const { data: claimed } = await supabase
      .from('queue_entries')
      .update({ status: 'claimed', updated_at: now.toISOString() })
      .eq('id', entry.id)
      .eq('status', expectedStatus)
      .select('id')
      .single();
    if (!claimed) continue;

    const matchType = entry.party_size === 4 ? '2v2' : '1v1';
    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        court_id: courtId,
        match_type: matchType,
        match_title: entry.match_title ?? null,
        duration: entry.duration,
        status: 'In Progress',
        start_time: now.toISOString(),
        charge_amount: charge,
      })
      .select()
      .single();

    if (gameErr || !game) {
      // Release the claim so the entry can be processed later
      await supabase.from('queue_entries').update({ status: 'waiting' }).eq('id', entry.id);
      continue;
    }

    // Retarget the join deposit to this game so per-payer refunds can find it
    if (entry.deposit_tx_id) {
      await supabase.from('wallet_transactions')
        .update({ reference_number: game.id, remarks: 'Deposit converted to game fee' })
        .eq('id', entry.deposit_tx_id);
    }

    const playerIds: string[] = typeof entry.player_ids === 'string'
      ? JSON.parse(entry.player_ids)
      : (entry.player_ids ?? [entry.member_id]);

    const { error: gpErr } = await supabase
      .from('game_players')
      .insert(playerIds.map(pid => ({ game_id: game.id, member_id: pid, team: null })));
    if (gpErr) {
      // Release the claim and remove the orphaned game
      await supabase.from('queue_entries').update({ status: 'waiting' }).eq('id', entry.id);
      await supabase.from('games').delete().eq('id', game.id);
      continue;
    }

    // Update court status to In Game
    await supabase.from('courts').update({ status: 'In Game', last_activity: now.toISOString() }).eq('id', courtId);

    // Update queue entry to completed
    await supabase.from('queue_entries').update({ status: 'completed', court_id: courtId, updated_at: now.toISOString() }).eq('id', entry.id);

    return true;
  }

  // If no waiting entry could be matched to this court
  await supabase.from('courts').update({ status: 'Available' }).eq('id', courtId);
  return false;
}

let processAllRunning = false;

export async function processAllCourts(): Promise<void> {
  if (processAllRunning) return;
  processAllRunning = true;
  try {
    const supabase = createAdminClient();
    const { data: courts } = await supabase.from('courts').select('id');
    if (!courts) return;
    for (const c of courts) {
      await processCourtQueue(c.id);
    }
    await evaluateLights();
  } finally {
    processAllRunning = false;
  }
}
