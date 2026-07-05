import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { createClient } from '@/lib/supabase/server'
import { reloadWallet } from './index'

function makeSupabase(rpcResult: { data: any; error: any }) {
  return { rpc: vi.fn().mockResolvedValue(rpcResult) }
}

describe('reloadWallet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calls reload_wallet RPC with mapped params', async () => {
    const supabase = makeSupabase({ data: 'tx-id', error: null })
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    await reloadWallet({ memberId: 'PB-001', amount: 500, referenceNumber: 'REF-1' })

    expect(supabase.rpc).toHaveBeenCalledWith('reload_wallet', {
      p_member_id: 'PB-001',
      p_amount: 500,
      p_reference_number: 'REF-1',
    })
  })

  it('throws the RPC error message on failure', async () => {
    const supabase = makeSupabase({ data: null, error: { message: 'Member not found' } })
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    await expect(reloadWallet({ memberId: 'missing', amount: 500, referenceNumber: '' }))
      .rejects.toThrow('Member not found')
  })
})
