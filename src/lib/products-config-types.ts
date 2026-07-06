export interface ProductsConfig {
  matchTypes: string[];
  durations: number[];
  rates: Record<string, number>;
  prepTimeSec: number;
}

export function getCost(config: ProductsConfig, duration: number, partySize: number): number {
  const rate = config.rates[String(duration)] ?? 0;
  return Math.round((rate * (duration / 30)) / (partySize === 4 ? 2 : 1));
}

/** No prep time for games shorter than 5 min. */
export function effectivePrepSec(duration: number, configuredPrepSec: number): number {
  if (duration < 5) return 0;
  return configuredPrepSec;
}
