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
    const defaultPrices = { '15': 100, '30': 150, '60': 300, '90': 450 };
    const prices = data?.value ? JSON.parse(data.value) : defaultPrices;
    if (!prices || typeof prices !== 'object' || Array.isArray(prices)) throw new Error('invalid prices');
    const formattedPrices: Record<string, number> = {};
    for (const [key, val] of Object.entries(prices)) {
      if (/^\d+$/.test(key)) {
        formattedPrices[key] = Number(val) || 0;
      }
    }
    return NextResponse.json({ prices: formattedPrices });
  } catch {
    return NextResponse.json({ error: 'Invalid price configuration' }, { status: 503 });
  }
}
