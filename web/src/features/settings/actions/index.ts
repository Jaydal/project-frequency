'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveProducts(formData: FormData) {
  const supabase = await createClient();

  const raw = formData.get('matchTypes') as string;
  const durationsRaw = formData.get('durations') as string;
  const ratesRaw = formData.get('rates') as string;

  const matchTypes = raw.split(',').map(s => s.trim()).filter(Boolean);
  const durations = durationsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  const rates = JSON.parse(ratesRaw);

  await supabase.from('settings').upsert({ key: 'products', value: JSON.stringify({ matchTypes, durations }) }, { onConflict: 'key' });
  await supabase.from('settings').upsert({ key: 'prices', value: JSON.stringify(rates) }, { onConflict: 'key' });

  try {
    const { publishAllDisplays } = await import('@/lib/display/publish-all');
    await publishAllDisplays();
  } catch (err) {
    console.error('Failed to broadcast updated products/rates:', err);
  }

  revalidatePath('/settings');
}
