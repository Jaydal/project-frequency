'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function assignRFID(data: { memberId: string | null; uid: string }) {
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from('rfid_cards').select('id').eq('uid', data.uid).single();
  if (existing) throw new Error('RFID UID already exists');

  const insert: any = { uid: data.uid };
  if (data.memberId) {
    const { data: member } = await supabase
      .from('members').select('id').eq('id', data.memberId).single();
    if (!member) throw new Error('Member not found');
    insert.member_id = member.id;
    insert.status = 'Active';
  } else {
    insert.status = 'Unassigned';
  }

  const { error } = await supabase.from('rfid_cards').insert(insert);
  if (error) throw new Error(error.message);

  revalidatePath('/rfid');
  revalidatePath('/members');
}
