'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function saveProducts(formData: FormData) {
  const supabase = await createClient();

  const raw = formData.get('matchTypes') as string;
  const durationsRaw = formData.get('durations') as string;
  const ratesRaw = formData.get('rates') as string;
  const prepTimeRaw = formData.get('prepTime') as string;

  const matchTypes = raw.split(',').map(s => s.trim()).filter(Boolean);
  const durations = durationsRaw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
  const rates = JSON.parse(ratesRaw);
  const prepTime = parseInt(prepTimeRaw, 10);

  await supabase.from('settings').upsert({ key: 'products', value: JSON.stringify({ matchTypes, durations }) }, { onConflict: 'key' });
  await supabase.from('settings').upsert({ key: 'prices', value: JSON.stringify(rates) }, { onConflict: 'key' });
  await supabase.from('settings').upsert({ key: 'preparationTime', value: String(isNaN(prepTime) ? 300 : prepTime) }, { onConflict: 'key' });

  revalidatePath('/settings');
}
