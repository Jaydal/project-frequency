import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('./booking-engine', () => ({ findAvailableCourt: vi.fn(), isSlotAvailable: vi.fn() }))
vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { findAvailableCourt } from './booking-engine'
import { joinQueue, leaveQueue, getQueuePosition, getEstimatedWait } from './queue-service'

function makeChain(settingsMock?: any) {
  const c: any = {
    select: vi.fn(() => c),
    eq: vi.fn(() => c),
    single: vi.fn(),
    order: vi.fn(() => c),
    insert: vi.fn(() => c),
    update: vi.fn(() => c),
    in: vi.fn(() => c),
    lt: vi.fn(() => c),
    count: vi.fn(() => c),
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
      c.single = vi.fn(async () => ({ data: { value: '{"30":150,"60":300}' }, error: null }))
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
    if (t === 'wallet_transactions') {
      const c = makeChain()
      c.insert = vi.fn(() => c)
      return c
    }
    return orig(t)
  })
  return db
}

describe('joinQueue', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a waiting entry when court is available', async () => {
    const db = withWallet(withPrices(makeDb()))
    db.from = vi.fn((t: string) => {
      const c = makeChain()
      if (t === 'settings') {
        c.single = vi.fn(async () => ({ data: { value: '{"30":150,"60":300}' }, error: null }))
        return c
      }
      if (t === 'wallets') {
        c.single = vi.fn(async () => ({ data: { id: 'w1', balance: 1000 }, error: null }))
        c.update = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.select = vi.fn(() => c)
        c.single = vi.fn(async () => ({ data: { id: 'w1', balance: 940 }, error: null }))
        return c
      }
      if (t === 'wallet_transactions') {
        c.insert = vi.fn(() => c)
        return c
      }
      if (t === 'members') {
        c.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }))
      }
      if (t === 'game_players') {
        c.eq = vi.fn(async () => ({ data: [], error: null }))
      }
      if (t === 'queue_entries') {
        c.single = vi.fn(async () => ({ data: null, error: null }))
        c.insert = vi.fn(() => {
          c.select = vi.fn(() => c)
          c.single = vi.fn(async () => ({ data: { id: 'q1', status: 'waiting' }, error: null }))
          return c
        })
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date('2026-07-07T14:00:00Z')
    const result = await joinQueue({ memberId: 'm1', start, duration: 60, partySize: 2, playerIds: ['m1', 'm2'] })
    expect(result.status).toBe('waiting')
  })

  it('inserts a waiting entry when no court is available', async () => {
    vi.mocked(findAvailableCourt).mockResolvedValue(null)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c = makeChain()
      if (t === 'settings') {
        c.single = vi.fn(async () => ({ data: { value: '{"30":150,"60":300}' }, error: null }))
        return c
      }
      if (t === 'members') {
        c.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }))
      }
      if (t === 'queue_entries') {
        c.single = vi.fn(async () => ({ data: null, error: null }))
        c.insert = vi.fn(() => {
          const insertChain = makeChain()
          insertChain.select = vi.fn(() => insertChain)
          insertChain.single = vi.fn(async () => ({ data: { id: 'qe-1', member_id: 'm1', status: 'waiting' }, error: null }))
          return insertChain
        })
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date('2026-07-07T14:00:00Z')
    const result = await joinQueue({ memberId: 'm1', start, duration: 60, partySize: 2, playerIds: ['m1', 'm2'] })
    expect(result.status).toBe('waiting')
  })

  it('allows booking even when member has active game', async () => {
    vi.mocked(findAvailableCourt).mockResolvedValue(null)
    const db = makeDb()
    db.from = vi.fn((t: string) => {
      const c = makeChain()
      if (t === 'settings') {
        c.single = vi.fn(async () => ({ data: { value: '{"30":150,"60":300}' }, error: null }))
        return c
      }
      if (t === 'members') {
        c.single = vi.fn(async () => ({ data: { status: 'Active' }, error: null }))
      }
      if (t === 'queue_entries') {
        c.single = vi.fn(async () => ({ data: null, error: null }))
        c.insert = vi.fn(() => {
          const chain = makeChain()
          chain.select = vi.fn(() => chain)
          chain.single = vi.fn(async () => ({ data: { id: 'qe-1', member_id: 'm1', status: 'waiting' }, error: null }))
          return chain
        })
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)

    const start = new Date('2026-07-07T14:00:00Z')
    const result = await joinQueue({ memberId: 'm1', start, duration: 60, partySize: 2, playerIds: ['m1', 'm2'] })
    expect(result.status).toBe('waiting')
  })
})

describe('leaveQueue', () => {
  it('calls update with cancelled status', async () => {
    const db = makeDb()
    vi.mocked(createClient).mockResolvedValue(db as any)
    await leaveQueue('qe-1')
    expect(db.from).toHaveBeenCalledWith('queue_entries')
  })
})

describe('getQueuePosition', () => {
  it('returns count of earlier waiting entries', async () => {
    const db = makeDb()
    let callCount = 0
    db.from = vi.fn(() => {
      const c = makeChain()
      c.eq = vi.fn(() => c)
      callCount++
      if (callCount === 1) {
        c.single = vi.fn(async () => ({ data: { created_at: '2026-07-07T12:00:00Z' }, error: null }))
      } else {
        c.lt = vi.fn(async () => ({ count: 3, error: null }))
      }
      return c
    })
    vi.mocked(createClient).mockResolvedValue(db as any)
    expect(await getQueuePosition('qe-1')).toBe(3)
  })
})

describe('getEstimatedWait', () => {
  it('formats human-readable time', () => {
    expect(getEstimatedWait(0)).toBe('Now')
    expect(getEstimatedWait(1)).toBe('~30 min')
    expect(getEstimatedWait(3)).toBe('~2 hours')
  })
})
