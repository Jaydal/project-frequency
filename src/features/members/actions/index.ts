'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createMember(data: {
  firstName: string;
  lastName: string;
  email?: string;
}) {
  const supabase = await createClient();
  const memberId = crypto.randomUUID().slice(0, 8).toUpperCase();
  const { error } = await supabase.rpc('create_member', {
    p_member_id: memberId,
    p_first_name: data.firstName,
    p_last_name: data.lastName,
    p_email: data.email ?? '',
  });
  if (error) throw new Error(error.message);

  revalidatePath('/members');
}

export async function updateMember(id: string, data: {
  firstName: string;
  lastName: string;
  email?: string;
  status: 'Active' | 'Inactive' | 'Suspended';
}) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('members')
    .update({
      first_name: data.firstName,
      last_name: data.lastName,
      email: data.email || null,
      status: data.status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/members');
}

export async function deleteMember(id: string) {
  const supabase = await createClient();

  // Check if member has games in game_players to preserve reports history
  const { count: gamesCount } = await supabase
    .from('game_players')
    .select('*', { count: 'exact', head: true })
    .eq('member_id', id);

  if (gamesCount && gamesCount > 0) {
    throw new Error('Cannot hard delete member with game history. Please set their status to Inactive or Suspended.');
  }

  // Delete queue entries
  await supabase.from('queue_entries').delete().eq('member_id', id);

  // Delete wallets and rfid cards will cascade automatically
  const { error } = await supabase
    .from('members')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/members');
}
