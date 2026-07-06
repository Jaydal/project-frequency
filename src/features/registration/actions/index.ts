'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function registerMember(data: {
  firstName: string;
  lastName: string;
  email?: string;
  rfidUid?: string;
  initialCredits?: number;
}) {
  const supabase = await createClient();

  const memberIdStr = crypto.randomUUID().slice(0, 8).toUpperCase();

  const { data: memberUuid, error: createErr } = await supabase.rpc('create_member', {
    p_member_id: memberIdStr,
    p_first_name: data.firstName,
    p_last_name: data.lastName,
    p_email: data.email ?? '',
  });
  if (createErr) throw new Error(createErr.message);
  if (!memberUuid) throw new Error('Failed to create member');

  if (data.rfidUid) {
    const { error: rfidErr } = await supabase
      .from('rfid_cards')
      .insert({ uid: data.rfidUid, member_id: memberUuid, status: 'Active' });
    if (rfidErr) throw new Error('RFID: ' + rfidErr.message);
  }

  if (data.initialCredits && data.initialCredits > 0) {
    const { error: walletErr } = await supabase.rpc('reload_wallet', {
      p_member_id: memberIdStr,
      p_amount: data.initialCredits,
      p_reference_number: `REG-${Date.now()}`,
    });
    if (walletErr) throw new Error('Credits: ' + walletErr.message);
  }

  revalidatePath('/members');
  revalidatePath('/register');

  return { success: true, memberId: memberIdStr };
}
