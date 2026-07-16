import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ isSlotAvailable: vi.fn() }))
vi.mock('./queue-processor', () => ({ processCourt: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable } from './booking-engine'
import { processCourt } from './queue-processor'
import { acceptOffer, declineOffer, expireOffer } from './reservation-service'

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
          single: vi.fn(async () => ({ data: { value: SETTINGS[key] ?? '300' }, error: null })),
        };
        return chain;
    }
    // Build a fresh chain for every other table
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

describe('acceptOffer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers game and marks entry completed', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = withSettingsMock(makeDb())
    db.rpc = vi.fn(async () => ({ data: 'game-1', error: null }))

    // Override queue_entries / members / courts / rfid_cards
    const orig = db.from;
    db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        let key = '';
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { key = val; return chain; }),
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
      return chain;
    });
    vi.mocked(createClient).mockResolvedValue(db as any);

    const result = await acceptOffer('qe-1');
    expect(result.success).toBe(true);
  })

  it('books expired entry when bookCourt is true', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = withSettingsMock(makeDb())
    db.rpc = vi.fn(async () => ({ data: 'game-1', error: null }))

    // Override with an expired entry
    db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        let key = '';
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { key = val; return chain; }),
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

      if (t === 'queue_entries') {
        chain.eq = vi.fn(() => chain);
        chain.single = vi.fn(async () => ({
          data: {
            id: 'qe-1', member_id: 'm1', court_id: 'c1', duration: 60,
            party_size: 2, player_ids: ['m1', 'm2'],
            requested_start: '2026-07-07T14:00:00Z',
            status: 'offered',
            // Entry is expired (past date)
            expires_at: '2020-01-01T00:00:00Z',
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
      return chain;
    });
    vi.mocked(createClient).mockResolvedValue(db as any);

    // Should succeed despite being expired because bookCourt skips the expiry check
    const result = await acceptOffer('qe-1', { bookCourt: true });
    expect(result.success).toBe(true);
  })

  it('returns error when slot is no longer available', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(false)
    const db = withSettingsMock(makeDb())

    // Override queue_entries / members
    db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        let key = '';
        const chain: any = {
          select: vi.fn(() => chain),
          eq: vi.fn((_col: string, val: string) => { key = val; return chain; }),
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

    const result = await acceptOffer('qe-1');
    expect(result.success).toBe(false);
  })
})

describe('declineOffer', () => {
  it('marks declined and processes next court', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await declineOffer('qe-1', 'c1')
    expect(processCourt).toHaveBeenCalledWith('c1')
  })
})

describe('expireOffer', () => {
  it('marks expired and processes next court', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      update: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: null, error: null })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    await expireOffer('qe-1', 'c1')
    expect(processCourt).toHaveBeenCalledWith('c1')
  })
})
