'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { processCourt } from '@/lib/queue/queue-processor';

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
  const { error } = await supabase.from('courts').delete().eq('id', courtId);
  if (error) throw new Error(error.message);
  revalidatePath('/courts');
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
    .update({ status: 'Completed', end_time: now })
    .eq('id', gameId);
  await supabase.from('courts').update({ status: 'Available', last_activity: now }).eq('id', courtId);

  if (refund && game.charge_amount) {
    const memberIds = (game.game_players ?? []).map((gp: any) => gp.member_id).filter(Boolean);
    const perPlayer = Math.round(Number(game.charge_amount) / (memberIds.length || 1));
    for (const memberId of memberIds) {
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('member_id', memberId)
        .single();
      if (wallet) {
        const { data: updated } = await supabase
          .from('wallets')
          .update({ balance: wallet.balance + perPlayer })
          .eq('id', wallet.id)
          .eq('balance', wallet.balance)
          .select()
          .single();
        if (!updated) throw new Error('Concurrent wallet update, try again');
        await supabase.from('wallet_transactions').insert({
          wallet_id: wallet.id,
          amount: perPlayer,
          type: 'Refund',
          reference_number: gameId,
          remarks: 'Game ended early — refund',
        });
      }
    }
  }

  await processCourt(courtId);
  revalidatePath('/courts');
}

export async function reorderQueue(entryId: string, targetIndex: number) {
  const supabase = await createClient();

  const { data: allWaiting } = await supabase
    .from('queue_entries')
    .select('id, created_at')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  const others = (allWaiting ?? []).filter(e => e.id !== entryId);
  if (others.length === 0) throw new Error('No other waiting entries to reorder against');

  const clampedIndex = Math.max(0, Math.min(targetIndex, others.length));

  let insertTime: Date;
  if (clampedIndex === 0) {
    insertTime = new Date(new Date(others[0].created_at).getTime() - 1000);
  } else if (clampedIndex >= others.length) {
    insertTime = new Date(new Date(others[others.length - 1].created_at).getTime() + 1000);
  } else {
    const before = new Date(others[clampedIndex - 1].created_at).getTime();
    const after = new Date(others[clampedIndex].created_at).getTime();
    insertTime = new Date((before + after) / 2);
  }

  const { error } = await supabase
    .from('queue_entries')
    .update({ created_at: insertTime.toISOString() })
    .eq('id', entryId);
  if (error) throw new Error(error.message);

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
    .update({ status: 'Completed', end_time: now })
    .eq('id', gameId);
  await supabase.from('courts').update({ status: 'Available', last_activity: now }).eq('id', courtId);

  const { data: allWaiting } = await supabase
    .from('queue_entries')
    .select('id, created_at')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  const playerIds = (game.game_players ?? []).map((gp: any) => gp.member_id);
  const existingCount = allWaiting?.length ?? 0;
  const insertPosition = Math.max(0, Math.min(position, existingCount));

  // Insert at the chosen position by manipulating created_at
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

  revalidatePath('/courts');
}
