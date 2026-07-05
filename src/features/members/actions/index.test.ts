import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { createMember } from './index'

function makeSupabase(rpcResult: { data: any; error: any }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) }
}

describe('createMember', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls create_member RPC with mapped params', async () => {
    const supabase = makeSupabase({ data: 'new-member-id', error: null })
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    await createMember({ memberId: 'PB-001', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' })

    expect(supabase.rpc).toHaveBeenCalledWith('create_member', {
      p_member_id: 'PB-001',
      p_first_name: 'Jane',
      p_last_name: 'Doe',
      p_email: 'jane@example.com',
    })
  })

  it('throws the RPC error message on failure', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'Member ID or email already exists' } })
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    await expect(createMember({ memberId: 'PB-001', firstName: 'Jane', lastName: 'Doe', email: '' }))
      .rejects.toThrow('Member ID or email already exists')
  })
})
