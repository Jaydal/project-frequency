import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PATCH } from './route';
import { cancelBooking } from '@/lib/queue/advanced-booking';

const userId = '550e8400-e29b-41d4-a716-446655440000';
const otherBooking = '660e8400-e29b-41d4-a716-446655440000';

vi.mock('@/lib/queue/advanced-booking', () => ({
  cancelBooking: vi.fn(),
}));

const makeClient = (owned: boolean) => ({
  auth: { getUser: vi.fn(async () => ({ data: { user: { id: userId, app_metadata: {} } }, error: null })) },
  from: vi.fn((table: string) => ({
    select: vi.fn(() => ({
      eq: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: table === 'game_players' && owned ? { id: 'player-1' } : null, error: null })) })),
        maybeSingle: vi.fn(async () => ({ data: table === 'games' ? null : null, error: null })),
      })),
    })),
  })),
});

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/display/publish-all', () => ({
  publishAllDisplays: vi.fn(() => Promise.resolve({ ok: true, failed: 0, total: 0 })),
}));

describe('PATCH /api/bookings/[id]', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue(makeClient(false));
    (cancelBooking as any).mockResolvedValue({ success: true, refunded: 0 });
  });

  it('rejects cancelling another member booking', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/bookings/' + otherBooking, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      { params: Promise.resolve({ id: otherBooking }) },
    );

    expect(response.status).toBe(403);
    expect(cancelBooking).not.toHaveBeenCalled();
  });

  it('allows a participant to cancel their booking', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue(makeClient(true));

    const response = await PATCH(
      new Request('http://localhost/api/bookings/' + otherBooking, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      }),
      { params: Promise.resolve({ id: otherBooking }) },
    );

    expect(response.status).toBe(200);
    expect(cancelBooking).toHaveBeenCalledWith(otherBooking, false);
  });
});
