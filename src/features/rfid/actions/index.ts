'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function assignRFID(data: { memberId: string; uid: string }) {
  const supabase = await createClient();

  const { data: member } = await supabase
    .from('members').select('id').eq('member_id', data.memberId).single();
  if (!member) throw new Error('Member not found');

  const { data: existing } = await supabase
    .from('rfid_cards').select('id').eq('uid', data.uid).single();
  if (existing) throw new Error('RFID already assigned');

  const { error } = await supabase
    .from('rfid_cards')
    .insert({ uid: data.uid, member_id: member.id, status: 'Active' });
  if (error) throw new Error(error.message);

  revalidatePath('/rfid');
  revalidatePath('/members');
}
