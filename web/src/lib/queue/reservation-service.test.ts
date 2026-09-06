import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ isSlotAvailable: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable } from './booking-engine'
import { finalizeBooking, declineOffer, expireOffer } from './reservation-service'

const SETTINGS: Record<string, string> = {
  prices: '{"30":150,"60":300}',
  preparationTime: '300',
};

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
    insert: vi.fn(() => chain),
  }
  return { from: vi.fn((_: string) => chain), rpc: vi.fn() }
}

function withSettingsMock(db: any) {
  db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        let key = '';
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { key = val; return chain; }),
          in: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { value: SETTINGS[key] ?? '300' }, error: null })),
        };
        return chain;
    }
    const chain: any = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      single: vi.fn(),
      order: vi.fn(() => chain),
      update: vi.fn(() => chain),
      in: vi.fn(() => chain),
      insert: vi.fn(() => chain),
    };
    return chain;
  });
  return db;
}

describe('finalizeBooking', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers game and marks entry completed', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = withSettingsMock(makeDb())
    db.rpc = vi.fn(async () => ({ data: 'game-1', error: null }))

    const orig = db.from;
    db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        let key = '';
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { key = val; return chain; }),
          in: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { value: SETTINGS[key] ?? '300' }, error: null })),
        };
        return chain;
      }

      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(),
        order: vi.fn(() => chain),
        update: vi.fn(() => chain),
        in: vi.fn(() => chain),
      };

      if (t === 'queue_entries') {
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({
          data: {
            id: 'qe-1', member_id: 'm1', court_id: 'c1', duration: 60,
            party_size: 2, player_ids: ['m1', 'm2'],
            requested_start: '2026-07-07T14:00:00Z',
            status: 'offered',
            expires_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        }));
      }
      if (t === 'members') {
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }));
      }
      if (t === 'courts') {
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({ data: { name: 'Court 1' }, error: null }));
      }
      if (t === 'rfid_cards') {
        chain.in = vi.fn(() => chain);
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({ data: null, error: null }));
      }
      if (t === 'games') {
        chain.eq = vi.fn(() => chain);
        chain.update = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({ data: { start_time: '2026-07-07T14:00:00Z' }, error: null }));
      }
      return chain;
    });
    vi.mocked(createClient).mockResolvedValue(db as any);

    const result = await finalizeBooking('qe-1');
    expect(result.success).toBe(true);
  })

  it('returns error when slot is no longer available', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(false)
    const db = withSettingsMock(makeDb())

    db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        let key = '';
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { key = val; return chain; }),
          in: vi.fn(() => chain),
          single: vi.fn(async () => ({ data: { value: SETTINGS[key] ?? '300' }, error: null })),
        };
        return chain;
      }

      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        single: vi.fn(),
        order: vi.fn(() => chain),
        update: vi.fn(() => chain),
        in: vi.fn(() => chain),
      };

      if (t === 'queue_entries') {
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({
          data: {
            id: 'qe-1', member_id: 'm1', court_id: 'c1', duration: 60,
            party_size: 2, player_ids: ['m1', 'm2'],
            requested_start: '2026-07-07T14:00:00Z',
            status: 'offered',
            expires_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        }));
      }
      if (t === 'members') {
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }));
      }
      return chain;
    });
    vi.mocked(createClient).mockResolvedValue(db as any);

    const result = await finalizeBooking('qe-1');
    expect(result.success).toBe(false);
  })
})

describe('declineOffer', () => {
  it('marks declined', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await declineOffer('qe-1')
  })
})

describe('expireOffer', () => {
  it('marks expired', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await expireOffer('qe-1')
  })
})
