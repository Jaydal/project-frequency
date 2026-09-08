export interface ProductsConfig {
  matchTypes: string[];
  durations: number[];
  rates: Record<string, number>;
}

export function getCost(config: ProductsConfig, duration: number, partySize: number): number {
  if (config.rates[String(duration)] !== undefined) {
    const rate = config.rates[String(duration)];
    return Math.round(rate / (partySize === 4 ? 2 : 1));
  }
  const baseRate = config.rates['30'] ?? config.rates['15'] ?? (Object.values(config.rates)[0] ?? 0);
  const baseDur = config.rates['30'] ? 30 : (config.rates['15'] ? 15 : (Number(Object.keys(config.rates)[0]) || 30));
  const prorated = baseDur > 0 ? (baseRate * duration) / baseDur : 0;
  return Math.round(prorated / (partySize === 4 ? 2 : 1));
}

