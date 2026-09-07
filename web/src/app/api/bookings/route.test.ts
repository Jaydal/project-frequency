import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from './route';
import { createAdvancedBooking, getUpcomingBookings } from '@/lib/queue/advanced-booking';

const memberId = '550e8400-e29b-41d4-a716-446655440000';
const mockUser = { id: memberId, email: 'test@example.com' };

vi.mock('@/lib/queue/advanced-booking', () => ({
  createAdvancedBooking: vi.fn(),
  getUpcomingBookings: vi.fn(),
}));

vi.mock('@/lib/terminal-auth', () => ({
  getTerminalMemberId: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
}));

vi.mock('@/lib/display/publish-all', () => ({
  publishAllDisplays: vi.fn().mockResolvedValue({ ok: true, failed: 0, total: 0 }),
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
    const { publishAllDisplays } = await import('@/lib/display/publish-all');
    (publishAllDisplays as any).mockResolvedValue({ ok: true, failed: 0, total: 0 });
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

  it('returns 401 when not authenticated and no terminal token', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
    });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, start: new Date().toISOString(), duration: 60, partySize: 2, playerIds: [memberId] }),
    }));
    expect(res.status).toBe(401);
  });

  it('allows request with valid terminal token even without user session', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockReturnValue({
      auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })) },
      from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn() })) })) })),
    });
    const { getTerminalMemberId } = await import('@/lib/terminal-auth');
    (getTerminalMemberId as any).mockReturnValue(memberId);
    
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: 'game-1', status: 'Scheduled', court_id: 'court-1' } });
    
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-terminal-token': 'valid-token' },
      body: JSON.stringify({ memberId, start: new Date(Date.now() + 86400000).toISOString(), duration: 60, partySize: 2, playerIds: [memberId] }),
    }));
    expect(res.status).toBe(201);
  });

  it('returns 400 for invalid start window', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: '', status: '', court_id: null }, error: 'Booking window cannot exceed 7 days' });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, start: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString(), duration: 60, partySize: 2, playerIds: [memberId] }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Booking window cannot exceed 7 days');
  });

  it('returns 403 when a user tries to book for another member', async () => {
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: '550e8400-e29b-41d4-a716-446655440999',
        start: new Date(Date.now() + 86400000).toISOString(),
        duration: 60,
        partySize: 2,
        playerIds: ['550e8400-e29b-41d4-a716-446655440999'],
      }),
    }));
    expect(res.status).toBe(403);
    expect(createAdvancedBooking).not.toHaveBeenCalled();
  });

  it('returns 201 on successful booking', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: 'game-1', status: 'Scheduled', court_id: 'court-1' } });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, start: new Date(Date.now() + 86400000).toISOString(), duration: 60, partySize: 2, playerIds: [memberId] }),
    }));
    expect(res.status).toBe(201);
  });

  it('accepts empty matchTitle and empty playerIds, defaulting playerIds to memberId', async () => {
    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: 'game-2', status: 'Scheduled', court_id: 'court-1' } });
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId,
        start: new Date(Date.now() + 86400000).toISOString(),
        duration: 60,
        partySize: 2,
        playerIds: [],
        matchTitle: '',
      }),
    }));
    expect(res.status).toBe(201);
    expect(createAdvancedBooking).toHaveBeenCalledWith(expect.objectContaining({
      memberId,
      playerIds: [memberId],
    }));
  });

  it('allows staff to book for another member', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    (createClient as any).mockImplementation(() => ({
      auth: {
        getUser: vi.fn(() => Promise.resolve({
          data: {
            user: { id: 'staff-user-id', email: 'admin@pickleball.com', app_metadata: { role: 'admin' } },
          },
          error: null,
        })),
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      })),
    }));

    (createAdvancedBooking as any).mockResolvedValue({ booking: { id: 'game-3', status: 'Scheduled', court_id: 'court-1' } });
    const targetMember = '65d5489e-521c-4fe1-8da2-3cfce7adc289';
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: targetMember,
        start: new Date(Date.now() + 86400000).toISOString(),
        duration: 60,
        partySize: 2,
        playerIds: [targetMember],
      }),
    }));
    expect(res.status).toBe(201);
    expect(createAdvancedBooking).toHaveBeenCalledWith(expect.objectContaining({
      memberId: targetMember,
    }));
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
    const res = await GET(new Request(`http://localhost/api/bookings?memberId=${memberId}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
  });

  it('returns 403 when a user requests another member\'s bookings', async () => {
    const res = await GET(new Request('http://localhost/api/bookings?memberId=other-member'));
    expect(res.status).toBe(403);
    expect(getUpcomingBookings).not.toHaveBeenCalled();
  });
});

describe('POST /api/bookings rate limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('returns 429 when same member books twice within 60 seconds', async () => {
    const { checkRateLimit } = await import('@/lib/rate-limit');
    (checkRateLimit as any).mockReturnValueOnce(false);

    const { POST } = await import('./route');
    const res = await POST(new Request('http://localhost/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId: '550e8400-e29b-41d4-a716-446655440000', start: new Date(Date.now() + 86400000).toISOString(), duration: 60, partySize: 2, playerIds: ['550e8400-e29b-41d4-a716-446655440000'] }),
    }));
    expect(res.status).toBe(429);
  });
});
