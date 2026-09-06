import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}));

import { createClient } from '@/lib/supabase/server';
import { requireStaff } from './server-guards';

describe('server authorization guards', () => {
  it('rejects an unauthenticated request', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as never);

    const result = await requireStaff();
    expect(result.response?.status).toBe(401);
  });

  it('rejects an authenticated non-staff user', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', app_metadata: {} } } }) },
    } as never);

    const result = await requireStaff();
    expect(result.response?.status).toBe(403);
  });

  it('returns the client for a staff user', async () => {
    const client = { auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1', app_metadata: { role: 'staff' } } } }) } };
    vi.mocked(createClient).mockResolvedValue(client as never);

    const result = await requireStaff();
    expect(result.response).toBeUndefined();
    expect(result.supabase).toBe(client);
  });
});
