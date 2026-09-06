import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const maybeSingle = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  })),
}));

describe('GET /api/public/prices', () => {
  beforeEach(() => vi.resetAllMocks());

  it('returns only normalized public pricing data', async () => {
    maybeSingle.mockResolvedValue({ data: { value: '{"30":150,"60":300,"90":450,"secret":"hidden"}' }, error: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ prices: { '30': 150, '60': 300, '90': 450 } });
  });

  it('returns 503 for invalid configuration', async () => {
    maybeSingle.mockResolvedValue({ data: { value: 'not-json' }, error: null });
    const response = await GET();
    expect(response.status).toBe(503);
  });
});
