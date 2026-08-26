import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./queue-service', () => ({ deductWallet: vi.fn(), refundTransaction: vi.fn() }))
vi.mock('@/lib/products-config-types', () => ({ getCost: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { deductWallet } from './queue-service'
import { getCost } from '@/lib/products-config-types'
import { createAdvancedBooking } from './advanced-booking'

function makeChain(overrides?: any) {
  const c: any = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    single: vi.fn(async () => ({ data: undefined, error: null })),
    order: vi.fn(() => c),
    insert: vi.fn(() => c),
    update: vi.fn(() => c),
    in: vi.fn(() => c),
    lt: vi.fn(() => c),
    gte: vi.fn(() => c),
    count: vi.fn(() => c),
    limit: vi.fn(() => c),
    ...overrides,
  }
  return c
}

function makeDb() {
  return { from: vi.fn((_: string) => makeChain()), rpc: vi.fn() }
}

function withPrices(db: any) {
  const orig = db.from
  db.from = vi.fn((t: string) => {
    if (t === 'settings') {
      const c = makeChain()
      c.single = vi.fn(async () => ({ data: { value: '{"30":150,"60":300,"90":450}' }, error: null }))
      return c
    }
    return orig(t)
  })
  return db
}

function withCourts(db: any) {
  const orig = db.from
  db.from = vi.fn((t: string) => {
    if (t === 'courts') {
      const c = makeChain()
      c.single = vi.fn(async () => ({ data: { id: 'court-1', name: 'Court 1', status: 'Available' }, error: null }))
      return c
    }
    return orig(t)
  })
  return db
}

function withWallet(db: any) {
  const orig = db.from
  db.from = vi.fn((t: string) => {
    if (t === 'wallets') {
      const c = makeChain()
      c.single = vi.fn(async () => ({ data: { id: 'w1', balance: 1000 }, error: null }))
      c.update = vi.fn(() => c)
      c.eq = vi.fn(() => c)
      c.select = vi.fn(() => c)
      c.single = vi.fn(async () => ({ data: { id: 'w1', balance: 940 }, error: null }))
      return c
    }
    return orig(t)
  })
  return db
}

function withGames(db: any) {
  const orig = db.from
  db.from = vi.fn((t: string) => {
    if (t === 'games') {
      const c = makeChain()
      c.insert = vi.fn(() => c)
      c.select = vi.fn(() => c)
      c.single = vi.fn(async () => ({ data: { id: 'game-1', court_id: 'court-1', status: 'Scheduled', charge_amount: 150, start_time: new Date(Date.now() + 86400000).toISOString() }, error: null }))
      return c
    }
    return orig(t)
  })
  return db
}

function withGamePlayers(db: any) {
  const orig = db.from
  db.from = vi.fn((t: string) => {
    if (t === 'game_players') {
      const c = makeChain()
      c.insert = vi.fn(() => c)
      return c
    }
    return orig(t)
  })
  return db
}

describe('createAdvancedBooking', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue(makeDb() as any)
    vi.mocked(deductWallet).mockResolvedValue('tx-1')
    vi.mocked(getCost).mockReturnValue(150)
  })

  it('rejects start time more than 7 days in the future', async () => {
    const input = {
      memberId: 'member-1',
      start: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(),
      duration: 60,
      partySize: 2,
      playerIds: ['member-1'],
    }
    const result = await createAdvancedBooking(input)
    expect(result.error).toBe('Booking window cannot exceed 7 days')
    expect(result.booking.id).toBe('')
  })

  it('rejects start time in the past', async () => {
    const input = {
      memberId: 'member-1',
      start: new Date(Date.now() - 1000).toISOString(),
      duration: 60,
      partySize: 2,
      playerIds: ['member-1'],
    }
    const result = await createAdvancedBooking(input)
    expect(result.error).toBe('Start time must be in the future')
    expect(result.booking.id).toBe('')
  })

  it('creates a Scheduled game when court is available', async () => {
    let gamePlayersInsert: ReturnType<typeof vi.fn> | undefined;
    const db = withGamePlayers(withGames(withWallet(withCourts(makeDb()))))
    db.from = vi.fn((t: string) => {
      if (t === 'settings') {
        const c = makeChain()
        c.single = vi.fn(async () => ({ data: { value: '{"30":150,"60":300,"90":450}' }, error: null }))
        return c
      }
      if (t === 'courts') {
        const c = makeChain()
        c.single = vi.fn(async () => ({ data: { id: 'court-1', name: 'Court 1', status: 'Available' }, error: null }))
        return c
      }
      if (t === 'wallets') {
        const c = makeChain()
        c.single = vi.fn(async () => ({ data: { id: 'w1', balance: 1000 }, error: null }))
        c.update = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.select = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { id: 'w1', balance: 940 }, error: null }))
        return c
      }
      if (t === 'games') {
        const c = makeChain()
        c.insert = vi.fn(() => c)
        c.select = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { id: 'game-1', court_id: 'court-1', status: 'Scheduled', charge_amount: 150, start_time: new Date(Date.now() + 86400000).toISOString() }, error: null }))
        return c
      }
      if (t === 'game_players') {
        const c = makeChain()
        gamePlayersInsert = vi.fn(() => c)
        c.insert = gamePlayersInsert
        return c
      }
      return makeChain()
    })

    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    const input = {
      memberId: 'member-1',
      courtId: 'court-1',
      start,
      duration: 60,
      partySize: 2,
      playerIds: ['member-1'],
    }
    const result = await createAdvancedBooking(input)
    expect(result.error).toBeUndefined()
    expect(result.booking.status).toBe('Scheduled')
    expect(result.booking.id).toBe('game-1')
    expect(result.booking.court_id).toBe('court-1')
    expect(gamePlayersInsert).toHaveBeenCalledWith([
      { game_id: 'game-1', member_id: 'member-1', team: null }
    ])
  })
})
