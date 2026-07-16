import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ isSlotAvailable: vi.fn(), findAvailableCourt: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))
vi.mock('./reservation-service', () => ({ acceptOffer: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { isSlotAvailable } from './booking-engine'
import { acceptOffer } from './reservation-service'
import { processCourt } from './queue-processor'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    update: vi.fn(() => chain),
    in: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    or: vi.fn(() => chain),
  }
  return { from: vi.fn((_: string) => chain), rpc: vi.fn() }
}

describe('processCourt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('auto-books the next waiting entry when slot is available', async () => {
    vi.mocked(acceptOffer).mockResolvedValue({ success: true })
    vi.mocked(isSlotAvailable).mockResolvedValue(true)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), update: vi.fn(), in: vi.fn(), lt: vi.fn(), gte: vi.fn(), or: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.order = vi.fn(() => c)
      c.update = vi.fn(() => c)
      c.in = vi.fn(() => c)
      c.lt = vi.fn(() => c)
      c.gte = vi.fn(() => c)
      c.single = vi.fn()
      c.or = vi.fn(() => c)
      if (t === 'settings') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { value: '300' }, error: null }))
      }
      if (t === 'queue_entries') {
        c.eq = vi.fn(() => c)
        c.order = vi.fn(async () => ({ data: [{ id: 'qe-1', member_id: 'm1', requested_start: '2026-07-07T14:00:00Z', duration: 60, party_size: 2, player_ids: ['m1', 'm2'] }], error: null }))
        // Mock the single() call for re-checking status
        c.single = vi.fn(async () => ({ data: { status: 'waiting' }, error: null }))
        // Mock the update().eq().eq().select() chain for atomic claim
        const select = vi.fn(async () => ({ data: [{ id: 'qe-1' }], error: null }))
        const eq2 = vi.fn(() => ({ select }))
        const eq1 = vi.fn(() => ({ eq: eq2 }))
        c.update = vi.fn(() => ({ eq: eq1 }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    await processCourt('c1')
    expect(acceptOffer).toHaveBeenCalledWith('qe-1', { bookCourt: true })
  })

  it('does nothing when queue is empty', async () => {
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c: any = { select: vi.fn(), eq: vi.fn(), single: vi.fn(), order: vi.fn(), update: vi.fn(), in: vi.fn(), lt: vi.fn(), gte: vi.fn(), or: vi.fn() }
      c.select = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.order = vi.fn(() => c)
      c.single = vi.fn()
      c.or = vi.fn(() => c)
      if (t === 'settings') {
        c.eq = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { value: '300' }, error: null }))
      }
      if (t === 'queue_entries') {
        c.eq = vi.fn(() => c)
        c.order = vi.fn(async () => ({ data: [], error: null }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    await processCourt('c1')
    // No error expected
  })
})
