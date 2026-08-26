import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { createAdvancedBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';

const mockUser = { id: 'm1', email: 'test@example.com' };

vi.mock('@/lib/queue/advanced-booking', () => ({
  createAdvancedBooking: vi.fn(),
  getUpcomingBookings: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
    })),
  })),
}));

describe('POST /api/bookings', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockImplementation(() => ({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      })),
    }));
  });

  it('returns 400 when not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
    });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1', start: new Date().toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(401);
  });

  it('returns 400 for invalid start window', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: '', status: '', court_id: null }, error: 'Booking window cannot exceed 7 days' });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1', start: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Booking window cannot exceed 7 days');
  });

  it('returns 201 on successful booking', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: 'game-1', status: 'Scheduled', court_id: 'court-1' } });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: 'm1', start: new Date(Date.now() + 86400000).toISOString(), duration: 60, partySize: 2, playerIds: ['m1'] }),
    }));
    expect(res.status).toBe(201);
  });
});

describe('GET /api/bookings', () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockImplementation(() => ({
      auth: {
        getUser: vi.fn(() => Promise.resolve({ data: { user: mockUser }, error: null })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      })),
    }));
    (getUpcomingBookings as any).mockResolvedValue([]);
  });

  it('returns 401 when not authenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
    });
    const res = await GET(new Request('http://localhost/api/bookings'));
    expect(res.status).toBe(401);
  });

  it('returns upcoming bookings for member', async () => {
    (getUpcomingBookings as any).mockResolvedValue([{ id: 'game-1', status: 'Scheduled' }]);
    const res = await GET(new Request('http://localhost/api/bookings?memberId=m1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });
});
