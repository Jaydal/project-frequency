import { describe, it, expect } from 'vitest';
import { getCost, ProductsConfig } from './products-config-types';

describe('products-config-types: getCost', () => {
  const config: ProductsConfig = {
    matchTypes: ['1v1', '2v2'],
    durations: [15, 30, 60, 90],
    rates: {
      '15': 100,
      '30': 150,
      '60': 300,
      '90': 450,
    },
  };

  it('calculates 1v1 singles cost correctly for configured durations', () => {
    expect(getCost(config, 15, 2)).toBe(100);
    expect(getCost(config, 30, 2)).toBe(150);
    expect(getCost(config, 60, 2)).toBe(300);
    expect(getCost(config, 90, 2)).toBe(450);
  });

  it('calculates 2v2 doubles cost correctly (50% per person)', () => {
    expect(getCost(config, 15, 4)).toBe(50);
    expect(getCost(config, 30, 4)).toBe(75);
    expect(getCost(config, 60, 4)).toBe(150);
    expect(getCost(config, 90, 4)).toBe(225);
  });

  it('prorates cost when an exact duration is not in rates map', () => {
    // 45 min based on 30 min (150) -> 150 * 1.5 = 225
    expect(getCost(config, 45, 2)).toBe(225);
  });
});
