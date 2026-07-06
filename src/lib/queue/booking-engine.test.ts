import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { findAvailableCourt, isSlotAvailable } from './booking-engine'

function makeDb() {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    single: vi.fn(),
    order: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    lte: vi.fn(() => chain),
  }
  return { from: vi.fn((_: string) => chain), rpc: vi.fn() }
}

describe('findAvailableCourt', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns a court when no overlapping games exist', async () => {
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lt: vi.fn(async () => ({ data: [], error: null })),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain),
      }
      if (t === 'courts') {
        chain.order = vi.fn(async () => ({
          data: [{ id: 'c1', name: 'Court 1', status: 'Available' }, { id: 'c2', name: 'Court 2', status: 'Available' }],
          error: null,
        }))
      }
      return chain
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await findAvailableCourt(new Date('2026-07-07T10:00:00Z'), 60, 2)
    expect(result).not.toBeNull()
    expect(result!.id).toBe('c1')
  })

  it('returns null when all courts have overlapping games', async () => {
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        gte: vi.fn(() => chain),
        lt: vi.fn(async () => ({ data: [{ id: 'g1' }], error: null })),
        lte: vi.fn(() => chain),
        order: vi.fn(() => chain),
      }
      if (t === 'courts') {
        chain.order = vi.fn(async () => ({
          data: [{ id: 'c1', name: 'Court 1', status: 'Available' }],
          error: null,
        }))
      }
      return chain
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await findAvailableCourt(new Date('2026-07-07T10:00:00Z'), 60, 2)
    expect(result).toBeNull()
  })
})

describe('isSlotAvailable', () => {
  it('returns true when no games overlap', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn(async () => ({ data: [], error: null })),
              lte: vi.fn(),
            })),
            lt: vi.fn(async () => ({ data: [], error: null })),
            lte: vi.fn(),
          })),
        })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await isSlotAvailable('c1', new Date('2026-07-07T10:00:00Z'), new Date('2026-07-07T11:00:00Z'))
    expect(result).toBe(true)
  })

  it('returns false when a game overlaps', async () => {
    const db = makeDb()
    db.from = vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          in: vi.fn(() => ({
            gte: vi.fn(() => ({
              lt: vi.fn(async () => ({ data: [{ id: 'g1' }], error: null })),
              lte: vi.fn(),
            })),
            lt: vi.fn(async () => ({ data: [{ id: 'g1' }], error: null })),
            lte: vi.fn(),
          })),
        })),
      })),
    }))
    vi.mocked(createClient).mockResolvedValue(db as any)

    const result = await isSlotAvailable('c1', new Date('2026-07-07T10:00:00Z'), new Date('2026-07-07T11:00:00Z'))
    expect(result).toBe(false)
  })
})
