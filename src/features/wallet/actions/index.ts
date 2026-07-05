'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function reloadWallet(data: {
  memberId: string;
  amount: number;
  referenceNumber: string;
}) {
  const supabase = await createClient();
  const { error } = await supabase.rpc('reload_wallet', {
    p_member_id: data.memberId,
    p_amount: data.amount,
    p_reference_number: data.referenceNumber,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/wallet');
}
