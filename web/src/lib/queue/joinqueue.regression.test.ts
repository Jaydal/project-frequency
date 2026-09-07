import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/mqtt', () => ({ publishDisplay: vi.fn(), publishBoard: vi.fn() }))
vi.mock('@/lib/display/sports-caster', () => ({ generatePayload: vi.fn(() => ({})) }))
vi.mock('@/lib/display/publish-all', () => ({ publishAllDisplays: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./booking-engine', () => ({ findAvailableCourt: vi.fn(), isSlotAvailable: vi.fn() }))

type Row = Record<string, any>

function makeFakeDb(tables: Record<string, Row[]>) {
  function query(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let orderKey: string | null = null
    let orderAsc = true
    let pendingUpdate: Row | null = null
    let mode: 'select' | 'update' = 'select'
    let selectCount = false

    const api: any = {
      select: (_c?: string, opts?: any) => { if (opts?.head) selectCount = true; return api },
      insert: (payload: Row | Row[]) => {
        const rows = Array.isArray(payload) ? payload : [payload]
        rows.forEach(r => {
          const row = { id: r.id ?? `${table}-${(tables[table]?.length ?? 0) + 1}`, created_at: r.created_at ?? new Date().toISOString(), ...r }
          tables[table] = tables[table] ?? []
          tables[table].push(row)
        })
        api._inserted = rows
        return api
      },
      update: (payload: Row) => { mode = 'update'; pendingUpdate = payload; return api },
      eq: (col: string, val: any) => { filters.push(r => r[col] === val); return api },
      lt: (col: string, val: any) => { filters.push(r => r[col] < val); return api },
      gte: (col: string, val: any) => { filters.push(r => r[col] >= val); return api },
      in: (col: string, vals: any[]) => { filters.push(r => vals.includes(r[col])); return api },
      or: (expr: string) => { return api },
      order: () => api,
      limit: () => api,
      maybeSingle: () => runSingle(),
      single: () => runSingle(),
      then: (resolve: any) => resolve(runList()),
    }
    function matched() {
      let rows = (tables[table] ?? []).filter(r => filters.every(f => f(r)))
      if (orderKey) rows = [...rows].sort((a, b) => (a[orderKey!] < b[orderKey!] ? -1 : a[orderKey!] > b[orderKey!] ? 1 : 0) * (orderAsc ? 1 : -1))
      return rows
    }
    function applyUpdate() { const rows = matched(); rows.forEach(r => Object.assign(r, pendingUpdate)); return rows }
    function runList() {
      if (mode === 'update') { const rows = applyUpdate(); return Promise.resolve({ data: rows, error: null }) }
      if (selectCount) return Promise.resolve({ count: matched().length, error: null })
      if (api._inserted) return Promise.resolve({ data: api._inserted, error: null })
      return Promise.resolve({ data: matched(), error: null })
    }
    function runSingle() {
      if (mode === 'update') { const rows = applyUpdate(); return Promise.resolve({ data: rows[0] ?? null, error: null }) }
      if (api._inserted) return Promise.resolve({ data: api._inserted[0] ?? null, error: null })
      const rows = matched()
      return Promise.resolve({ data: rows[0] ?? null, error: null })
    }
    return api
  }
  return { from: (t: string) => query(t), rpc: vi.fn() }
}

describe('REGRESSION: booking a free court while others wait', () => {
  beforeEach(() => vi.resetModules())

  it('books the free court 3 immediately even when a court-1 waiter exists', async () => {
    const now = Date.now()
    const tables: Record<string, Row[]> = {
      settings: [
        { key: 'preparationTime', value: '300' },
        { key: 'prices', value: '{"30":150,"60":300,"90":450}' },
      ],
      courts: [
        { id: 'c1', name: 'Court 1', status: 'In Game' },
        { id: 'c2', name: 'Court 2', status: 'In Game' },
        { id: 'c3', name: 'Court 3', status: 'Available' },
      ],
      games: [
        { id: 'g1', court_id: 'c1', duration: 60, status: 'In Progress', start_time: new Date(now - 10 * 60_000).toISOString() },
        { id: 'g2', court_id: 'c2', duration: 60, status: 'In Progress', start_time: new Date(now - 10 * 60_000).toISOString() },
      ],
      queue_entries: [],
      members: [{ id: 'm1', status: 'Active' }, { id: 'm2', status: 'Active' }],
      rfid_cards: [{ uid: 'UID1', member_id: 'm1', status: 'Active' }, { uid: 'UID2', member_id: 'm2', status: 'Active' }],
      wallets: [{ id: 'w1', member_id: 'm1', balance: 1000 }, { id: 'w2', member_id: 'm2', balance: 1000 }],
    }
    const db = makeFakeDb(tables)
    vi.doMock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => db) }))
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => db) }))
    // isSlotAvailable: court 3 free
    const { isSlotAvailable } = await import('./booking-engine')
    vi.mocked(isSlotAvailable).mockImplementation(async (courtId: string) => courtId === 'c3')

    const { joinQueue } = await import('./queue-service')

    // 1) Book busy court 1 -> waiting entry
    const r1 = await joinQueue({ memberId: 'm1', start: new Date(), duration: 60, partySize: 2, playerIds: ['m1'], courtId: 'c1' })
    console.log('book court1 ->', r1.status, 'court', r1.court_id)

    // 2) Book free court 3 -> should be a real game, NOT a waiting entry
    const r2 = await joinQueue({ memberId: 'm2', start: new Date(), duration: 60, partySize: 2, playerIds: ['m2'], courtId: 'c3' })
    console.log('book court3 ->', r2.status, 'court', r2.court_id)

    expect(r1.status).toBe('waiting')
    // THE BUG: court 3 is free but r2 becomes 'waiting' instead of 'completed'
    expect(r2.status).toBe('completed')
    expect(r2.court_id).toBe('c3')
    expect(tables.courts.find(c => c.id === 'c3')!.status).toBe('In Game')
  })
})
