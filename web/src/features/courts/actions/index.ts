'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { publishBoardOnce } from '@/lib/queue/board-publisher';
import { processCourtQueue } from '@/lib/queue/queue-processor';
import { publishAllDisplays } from '@/lib/display/publish-all';
import { deductWallet, refundTransaction } from '@/lib/queue/queue-service';

export async function updateCourt(courtId: string, name: string, newId?: string) {
  const supabase = await createClient();
  const updates: any = { name };
  if (newId && newId !== courtId) updates.id = newId;
  const { error } = await supabase.from('courts').update(updates).eq('id', courtId);
  if (error) throw new Error(error.message);
  revalidatePath('/courts');
}

export async function deleteCourt(courtId: string) {
  const supabase = await createClient();

  // queue_entries.court_id is nullable but intentionally does not cascade:
  // preserve queue history while releasing any entries assigned to a court
  // that is being removed. Games retain their historical rows via the
  // existing ON DELETE CASCADE constraint.
  const { error: detachError } = await supabase
    .from('queue_entries')
    .update({ court_id: null, updated_at: new Date().toISOString() })
    .eq('court_id', courtId);
  if (detachError) return { ok: false, error: detachError.message };

  const { error } = await supabase.from('courts').delete().eq('id', courtId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/courts');
  revalidatePath('/booking');
  publishBoardOnce().catch(() => {});
  return { ok: true as const };
}

export async function endGame(gameId: string, courtId: string, refund: boolean = false) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: game } = await supabase
    .from('games')
    .select('id, charge_amount, game_players(member_id)')
    .eq('id', gameId)
    .single();
  if (!game) throw new Error('Game not found');

  await supabase
    .from('games')
    .update({ status: 'Completed', end_time: now, ended_at: now })
    .eq('id', gameId);

  if (refund && game.id) {
    // Refund each payer via their own wallet transaction for this game
    const { data: txs } = await supabase
      .from('wallet_transactions')
      .select('id')
      .eq('reference_number', game.id)
      .in('type', ['game_fee', 'Game Charge']);
    if (txs && txs.length > 0) {
      for (const tx of txs) {
        await refundTransaction(tx.id, 'Game ended early — refund');
      }
    } else if (game.charge_amount && Number(game.charge_amount) > 0) {
      // Legacy fallback: games charged before per-game references — refund the
      // full amount to the first payer as before.
      const primaryMemberId = (game.game_players ?? [])[0]?.member_id;
      if (primaryMemberId) {
        await deductWallet(primaryMemberId, -Number(game.charge_amount), game.id);
      }
    }
  }

  await processCourtQueue(courtId);
  await publishAllDisplays();
  revalidatePath('/courts');
}

export async function updateGameDuration(gameId: string, durationMin: number, courtId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('games')
    .update({ duration: durationMin })
    .eq('id', gameId);
  
  if (error) throw new Error(error.message);

  // Republish display and board
  await processCourtQueue(courtId);
  await publishAllDisplays();
  revalidatePath('/courts');
}

export async function reorderQueue(entryId: string, overId: string) {
  const supabase = await createClient();
  if (entryId === overId) return;

  const { data: allWaiting } = await supabase
    .from('queue_entries')
    .select('id, created_at')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  const others = (allWaiting ?? []).filter(e => e.id !== entryId);
  const overIndex = others.findIndex(e => e.id === overId);
  if (overIndex === -1) throw new Error('Target entry not found');

  let insertTime: Date;
  if (overIndex === 0) {
    insertTime = new Date(new Date(others[0].created_at).getTime() - 1000);
  } else if (overIndex >= others.length - 1) {
    insertTime = new Date(new Date(others[others.length - 1].created_at).getTime() + 1000);
  } else {
    const before = new Date(others[overIndex - 1].created_at).getTime();
    const after = new Date(others[overIndex].created_at).getTime();
    insertTime = new Date((before + after) / 2);
  }

  const { error } = await supabase
    .from('queue_entries')
    .update({ created_at: insertTime.toISOString() })
    .eq('id', entryId);
  if (error) throw new Error(error.message);

  publishBoardOnce().catch(() => {});
  revalidatePath('/courts');
}

export async function reassignQueueEntry(entryId: string, courtId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('queue_entries')
    .update({ court_id: courtId, updated_at: new Date().toISOString() })
    .eq('id', entryId);
  if (error) throw new Error(error.message);

  publishBoardOnce().catch(() => {});
  revalidatePath('/courts');
}

export async function requeueGame(gameId: string, courtId: string, position: number) {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: game } = await supabase
    .from('games')
    .select('*, game_players(*)')
    .eq('id', gameId)
    .single();
  if (!game) throw new Error('Game not found');

  await supabase
    .from('games')
    .update({ status: 'Completed', end_time: now, ended_at: now })
    .eq('id', gameId);

  await processCourtQueue(courtId);

  const { data: allWaiting } = await supabase
    .from('queue_entries')
    .select('id, created_at')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  const playerIds = (game.game_players ?? []).map((gp: any) => gp.member_id);
  const existingCount = allWaiting?.length ?? 0;
  const insertPosition = Math.max(0, Math.min(position, existingCount));

  let insertTime: Date;
  if (insertPosition === 0 || !allWaiting || allWaiting.length === 0) {
    insertTime = new Date();
  } else if (insertPosition >= allWaiting.length) {
    insertTime = new Date(new Date(allWaiting[allWaiting.length - 1].created_at).getTime() + 1000);
  } else {
    const before = new Date(allWaiting[insertPosition - 1].created_at).getTime();
    const after = new Date(allWaiting[insertPosition].created_at).getTime();
    insertTime = new Date((before + after) / 2);
  }

  const { error } = await supabase.from('queue_entries').insert({
    member_id: playerIds[0] ?? game.member_id,
    requested_start: now,
    duration: game.duration,
    party_size: game.match_type === '2v2' ? 4 : 2,
    player_ids: JSON.stringify(playerIds),
    match_title: game.match_title,
    status: 'waiting',
    created_at: insertTime.toISOString(),
  });
  if (error) throw new Error(error.message);

  await publishAllDisplays();
  revalidatePath('/courts');
}
