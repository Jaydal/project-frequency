import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ isSlotAvailable: vi.fn() }))
vi.mock('./queue-processor', () => ({ processCourt: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable } from './booking-engine'
import { processCourt } from './queue-processor'
import { acceptOffer, declineOffer, expireOffer } from './reservation-service'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
  }
  return { from: vi.fn((_: string) => chain), rpc: vi.fn() }
}

describe('acceptOffer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('registers game and marks entry completed', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = makeDb()
    db.rpc = vi.fn(async () => ({ data: null, error: null }))
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), in: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.single = vi.fn()

      if (t === 'queue_entries') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({
          data: {
            id: 'qe-1', member_id: 'm1', court_id: 'c1', duration: 60,
            party_size: 2, player_ids: ['m1', 'm2'],
            requested_start: '2026-07-07T14:00:00Z',
            status: 'offered',
            expires_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        }))
      }
      if (t === 'members') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }))
      }
      if (t === 'courts') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { name: 'Court 1' }, error: null }))
      }
      if (t === 'rfid_cards') {
        c.in = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: null, error: null }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await acceptOffer('qe-1')
    expect(result.success).toBe(true)
  })

  it('returns error when slot is no longer available', async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(false)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), update: vi.fn(), in: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.single = vi.fn()

      if (t === 'queue_entries') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({
          data: {
            id: 'qe-1', member_id: 'm1', court_id: 'c1', duration: 60,
            party_size: 2, player_ids: ['m1', 'm2'],
            requested_start: '2026-07-07T14:00:00Z',
            status: 'offered',
            expires_at: '2099-01-01T00:00:00Z',
          },
          error: null,
        }))
      }
      if (t === 'members') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await acceptOffer('qe-1')
    expect(result.success).toBe(false)
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
