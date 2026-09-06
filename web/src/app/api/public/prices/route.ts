import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'prices')
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Unable to load prices' }, { status: 503 });

  try {
    const prices = data?.value ? JSON.parse(data.value) : { '30': 150, '60': 300, '90': 450 };
    if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('invalid prices');
    return NextResponse.json({ prices: { '30': Number(prices['30']) || 0, '60': Number(prices['60']) || 0, '90': Number(prices['90']) || 0 } });
  } catch {
    return NextResponse.json({ error: 'Invalid price configuration' }, { status: 503 });
  }
}
