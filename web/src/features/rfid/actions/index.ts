'use server';
import { requireStaff } from '@/lib/auth/server-guards';
import { revalidatePath } from 'next/cache';
import { getRfidFormats } from '@/lib/rfid';

function isMissingRowError(error: { code?: string } | null) {
  return error?.code === 'PGRST116';
}

export type AssignRFIDResult =
  | { ok: true }
  | {
      ok: false;
      code: 'RFID_ALREADY_ASSIGNED' | 'RFID_ALREADY_UNASSIGNED';
      message: string;
    };

async function getStaffClient() {
  const auth = await requireStaff();
  if (auth.response) {
    throw new Error(auth.response.status === 403 ? 'Forbidden' : 'Unauthorized');
  }
  return auth.supabase;
}

function isUniqueViolation(error: { code?: string } | null) {
  return error?.code === '23505';
}

function duplicateResult(status?: string): AssignRFIDResult {
  if (status === 'Unassigned') {
    return {
      ok: false,
      code: 'RFID_ALREADY_UNASSIGNED',
      message: 'This card is already Unassigned in the system',
    };
  }

  return {
    ok: false,
    code: 'RFID_ALREADY_ASSIGNED',
    message: 'This RFID card is already assigned to another member',
  };
}

export async function assignRFID(data: { memberId: string | null; uid: string }): Promise<AssignRFIDResult> {
  const supabase = await getStaffClient();
  const formats = getRfidFormats(data.uid);

  const { data: existing, error: existingError } = await supabase
    .from('rfid_cards')
    .select('id, status')
    .in('uid', formats)
    .maybeSingle();
  if (existingError) throw existingError;

  if (existing) {
    if (existing.status !== 'Unassigned') {
      return duplicateResult(existing.status);
    }
    
    if (!data.memberId) {
      return duplicateResult(existing.status);
    }

    const { data: member, error: memberError } = await supabase
      .from('members').select('id').eq('id', data.memberId).single();
    if (memberError && !isMissingRowError(memberError)) throw memberError;
    if (!member) throw new Error('Member not found');

    const { error } = await supabase
      .from('rfid_cards')
      .update({ member_id: member.id, status: 'Active', assigned_date: new Date().toISOString() })
      .eq('id', existing.id);
      
    if (error) throw new Error(error.message);
  } else {
    const insert: any = { uid: data.uid };
    if (data.memberId) {
      const { data: member, error: memberError } = await supabase
        .from('members').select('id').eq('id', data.memberId).single();
      if (memberError && !isMissingRowError(memberError)) throw memberError;
      if (!member) throw new Error('Member not found');
      insert.member_id = member.id;
      insert.status = 'Active';
    } else {
      insert.status = 'Unassigned';
    }

    const { error } = await supabase.from('rfid_cards').insert(insert);
    if (error) {
      if (isUniqueViolation(error)) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from('rfid_cards')
          .select('status')
          .in('uid', formats)
          .maybeSingle();
        if (duplicateError) throw duplicateError;
        return duplicateResult(duplicate?.status);
      }
      throw new Error(error.message);
    }
  }

  revalidatePath('/rfid');
  revalidatePath('/members');
  return { ok: true };
}

export async function unassignRFID(cardId: string) {
  const supabase = await getStaffClient();
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
  const supabase = await getStaffClient();
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
  const supabase = await getStaffClient();
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
