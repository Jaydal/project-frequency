import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/auth/server-guards', () => ({ requireStaff: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireStaff } from '@/lib/auth/server-guards'
import {
  assignRFID,
  deleteRFID,
  type AssignRFIDResult,
  unassignRFID,
  updateRFID,
} from './index'

type Result = { data: any; error: any }

function chainable(result: Result) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    single: vi.fn(async () => result),
    maybeSingle: vi.fn(async () => result),
    insert: vi.fn(async () => result),
    update: vi.fn(() => builder),
    in: vi.fn(() => builder),
  }
  return builder
}

function makeSupabase(byTable: Record<string, ReturnType<typeof chainable>>) {
  return { from: vi.fn((table: string) => byTable[table]) }
}

function authorize(supabase: unknown) {
  vi.mocked(requireStaff).mockResolvedValue({
    supabase,
    user: { id: 'staff-1' },
    response: undefined,
  } as never)
}

describe('assignRFID', () => {
  beforeEach(() => vi.clearAllMocks())

  it('inserts a new rfid_cards row when the member exists and the UID is free', async () => {
    const members = chainable({ data: { id: 'member-1' }, error: null })
    const rfidCards = chainable({ data: null, error: null })
    authorize(makeSupabase({ members, rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: 'member-1', uid: 'UID-123' }))
      .resolves.toEqual({ ok: true } satisfies AssignRFIDResult)

    // Assert RFID availability pre-check queries
    expect(rfidCards.select).toHaveBeenCalledWith('id, status')
    expect(rfidCards.in).toHaveBeenCalledWith('uid', ['UID-123'])

    // Assert member lookup by UUID
    expect(members.select).toHaveBeenCalledWith('id')
    expect(members.eq).toHaveBeenCalledWith('id', 'member-1')

    // Assert the insert call with correct payload
    expect(rfidCards.insert).toHaveBeenCalledWith({ uid: 'UID-123', member_id: 'member-1', status: 'Active' })
  })

  it('inserts unassigned when memberId is null', async () => {
    const rfidCards = chainable({ data: null, error: null })
    authorize(makeSupabase({ rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: null, uid: 'UID-456' }))
      .resolves.toEqual({ ok: true } satisfies AssignRFIDResult)

    expect(rfidCards.insert).toHaveBeenCalledWith({ uid: 'UID-456', status: 'Unassigned' })
  })

  it('throws Member not found when the member lookup misses', async () => {
    const rfidCards = chainable({ data: null, error: null })
    const members = chainable({ data: null, error: null })
    authorize(makeSupabase({ members, rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: 'missing', uid: 'UID-123' }))
      .rejects.toThrow('Member not found')
  })

  it('maps Supabase no-row member errors to Member not found', async () => {
    const rfidCards = chainable({ data: null, error: null })
    const members = chainable({
      data: null,
      error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' },
    })
    authorize(makeSupabase({ members, rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: 'missing', uid: 'UID-123' }))
      .rejects.toThrow('Member not found')
  })

  it('returns a stable duplicate result when the UID is already assigned', async () => {
    const members = chainable({ data: { id: 'member-1' }, error: null })
    const rfidCards = chainable({ data: { id: 'existing-card', status: 'Active' }, error: null })
    authorize(makeSupabase({ members, rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: 'member-1', uid: 'UID-123' }))
      .resolves.toEqual({
        ok: false,
        code: 'RFID_ALREADY_ASSIGNED',
        message: 'This RFID card is already assigned to another member',
      } satisfies AssignRFIDResult)
  })

  it('returns a stable unassigned result when adding an existing unassigned card', async () => {
    const rfidCards = chainable({ data: { id: 'existing-card', status: 'Unassigned' }, error: null })
    authorize(makeSupabase({ rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: null, uid: 'UID-123' }))
      .resolves.toEqual({
        ok: false,
        code: 'RFID_ALREADY_UNASSIGNED',
        message: 'This card is already Unassigned in the system',
      } satisfies AssignRFIDResult)
  })

  it('preserves unexpected RFID lookup database errors', async () => {
    const databaseError = { message: 'database unavailable', code: '57P01' }
    const rfidCards = chainable({ data: null, error: databaseError })
    authorize(makeSupabase({ rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: null, uid: 'UID-123' }))
      .rejects.toEqual(databaseError)
  })

  it('maps a unique UID race during insert to a stable duplicate result', async () => {
    const rfidCards = chainable({ data: null, error: null })
    rfidCards.maybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { status: 'Active' }, error: null })
    rfidCards.insert.mockResolvedValue({
      data: null,
      error: { code: '23505', constraint: 'rfid_cards_uid_key', message: 'duplicate key value violates unique constraint' },
    })
    authorize(makeSupabase({ rfid_cards: rfidCards }))

    await expect(assignRFID({ memberId: null, uid: 'UID-RACE' }))
      .resolves.toEqual({
        ok: false,
        code: 'RFID_ALREADY_ASSIGNED',
        message: 'This RFID card is already assigned to another member',
      } satisfies AssignRFIDResult)
  })

  it.each([
    ['assign', () => assignRFID({ memberId: null, uid: 'UID-123' })],
    ['unassign', () => unassignRFID('card-1')],
    ['delete', () => deleteRFID('card-1')],
    ['update', () => updateRFID('card-1', { status: 'Active', memberId: null })],
  ])('rejects unauthenticated %s action before database access', async (_name, action) => {
    vi.mocked(requireStaff).mockResolvedValue({
      supabase: { from: vi.fn() },
      user: null,
      response: new Response(null, { status: 401 }),
    } as never)

    await expect(action()).rejects.toThrow('Unauthorized')
  })
})
