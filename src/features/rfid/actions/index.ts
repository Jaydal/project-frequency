'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { getRfidFormats } from '@/lib/rfid';

export async function assignRFID(data: { memberId: string | null; uid: string }) {
  const supabase = await createClient();
  const formats = getRfidFormats(data.uid);

  const { data: existing } = await supabase
    .from('rfid_cards')
    .select('id, status')
    .in('uid', formats)
    .maybeSingle();

  if (existing) {
    if (existing.status !== 'Unassigned') {
      throw new Error('This RFID card is already assigned to another member');
    }
    
    if (!data.memberId) {
      throw new Error('This card is already Unassigned in the system');
    }

    const { data: member } = await supabase
      .from('members').select('id').eq('id', data.memberId).single();
    if (!member) throw new Error('Member not found');

    const { error } = await supabase
      .from('rfid_cards')
      .update({ member_id: member.id, status: 'Active', assigned_date: new Date().toISOString() })
      .eq('id', existing.id);
      
    if (error) throw new Error(error.message);
  } else {
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
  }

  revalidatePath('/rfid');
  revalidatePath('/members');
}

export async function unassignRFID(cardId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('rfid_cards')
    .update({
      member_id: null,
      status: 'Unassigned',
      assigned_date: null,
    })
    .eq('id', cardId);

  if (error) throw new Error(error.message);
  revalidatePath('/rfid');
  revalidatePath('/members');
}

export async function deleteRFID(cardId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from('rfid_cards')
    .delete()
    .eq('id', cardId);

  if (error) throw new Error(error.message);
  revalidatePath('/rfid');
  revalidatePath('/members');
}

export async function updateRFID(cardId: string, data: {
  status: string;
  memberId: string | null;
}) {
  const supabase = await createClient();
  const updateData: any = {
    status: data.status,
    member_id: data.memberId,
  };
  if (data.memberId) {
    updateData.assigned_date = new Date().toISOString();
  } else {
    updateData.assigned_date = null;
  }
  
  const { error } = await supabase
    .from('rfid_cards')
    .update(updateData)
    .eq('id', cardId);

  if (error) throw new Error(error.message);
  revalidatePath('/rfid');
  revalidatePath('/members');
}
