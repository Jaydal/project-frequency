import { createClient } from '@/lib/supabase/server';
import type { ProductsConfig } from './products-config-types';

const DEFAULTS: ProductsConfig = {
  matchTypes: ['1v1', '2v2'],
  durations: [30, 60, 90],
  rates: { '30': 150, '60': 300, '90': 450 },
  prepTimeSec: 300,
};

export async function getProductsConfig(): Promise<ProductsConfig> {
  const supabase = await createClient();
  const { data: rows } = await supabase.from('settings').select('key, value').in('key', ['products', 'prices', 'preparationTime']);
  if (!rows) return DEFAULTS;

  const map = new Map(rows.map(r => [r.key, r.value]));
  const products = tryParse(map.get('products'));
  const rates = tryParse(map.get('prices'));
  const prepTimeSec = parseInt(map.get('preparationTime') ?? '', 10);

  return {
    matchTypes: products?.matchTypes ?? DEFAULTS.matchTypes,
    durations: products?.durations ?? DEFAULTS.durations,
    rates: rates ?? DEFAULTS.rates,
    prepTimeSec: isNaN(prepTimeSec) ? DEFAULTS.prepTimeSec : prepTimeSec,
  };
}

function tryParse(json: string | undefined): any {
  if (!json) return undefined;
  try { return JSON.parse(json); } catch { return undefined; }
}
