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
