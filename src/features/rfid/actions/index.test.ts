import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { assignRFID } from './index'

type Result = { data: any; error: any }

function chainable(result: Result) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => result),
    insert: vi.fn(async () => result),
  }
  return builder
}

function makeSupabase(byTable: Record<string, ReturnType<typeof chainable>>) {
  return { from: vi.fn((table: string) => byTable[table]) }
}

describe('assignRFID', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a new rfid_cards row when the member exists and the UID is free', async () => {
    const members = chainable({ data: { id: 'member-1' }, error: null })
    const rfidCards = chainable({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(makeSupabase({ members, rfid_cards: rfidCards }) as any)

    await assignRFID({ memberId: 'PB-001', uid: 'UID-123' })

    expect(rfidCards.insert).toHaveBeenCalledWith({ uid: 'UID-123', member_id: 'member-1', status: 'Active' })
  })

  it('throws Member not found when the member lookup misses', async () => {
    const members = chainable({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(makeSupabase({ members }) as any)

    await expect(assignRFID({ memberId: 'missing', uid: 'UID-123' }))
      .rejects.toThrow('Member not found')
  })

  it('throws RFID already assigned when the UID is taken', async () => {
    const members = chainable({ data: { id: 'member-1' }, error: null })
    const rfidCards = chainable({ data: { id: 'existing-card' }, error: null })
    vi.mocked(createClient).mockResolvedValue(makeSupabase({ members, rfid_cards: rfidCards }) as any)

    await expect(assignRFID({ memberId: 'PB-001', uid: 'UID-123' }))
      .rejects.toThrow('RFID already assigned')
  })
})
