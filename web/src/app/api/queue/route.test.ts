import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJoinQueue = vi.hoisted(() => vi.fn());
const mockGetQueuePosition = vi.hoisted(() => vi.fn());
const mockGetEstimatedWait = vi.hoisted(() => vi.fn());
const mockFinalizeBooking = vi.hoisted(() => vi.fn());
const mockDeclineOffer = vi.hoisted(() => vi.fn());
const mockAuthenticateControllerDevice = vi.hoisted(() => vi.fn());
const mockSupabaseResults = vi.hoisted(() => [] as Array<{ data: any; error: any }>);

vi.mock('@/lib/queue/queue-service', () => ({
  joinQueue: mockJoinQueue,
  getQueuePosition: mockGetQueuePosition,
  getEstimatedWait: mockGetEstimatedWait,
}));

vi.mock('@/lib/queue/reservation-service', () => ({
  finalizeBooking: mockFinalizeBooking,
  declineOffer: mockDeclineOffer,
}));

vi.mock('@/lib/controller-device-auth', () => ({
  authenticateControllerDevice: mockAuthenticateControllerDevice,
}));

vi.mock('@/lib/queue/board-publisher', () => ({
  publishBoardOnce: vi.fn(),
}));

vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(() => true),
}));

let mockTableResults: Record<string, Array<{ data: any; error: any }>> = {};

const mockFrom = vi.fn((table?: string) => {
  const getResult = () => {
    if (table && mockTableResults[table]?.length) {
      return mockTableResults[table].shift();
    }
    if (mockSupabaseResults.length > 0) {
      return mockSupabaseResults.shift();
    }
    if (table === 'games' || table === 'game_players') {
      return { data: [], error: null };
    }
    if (table === 'queue_entries') {
      return { data: null, error: null };
    }
    if (table === 'courts') {
      return { data: { name: 'Court 1' }, error: null };
    }
    return { data: null, error: null };
  };

  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn(() => {
      const r = getResult();
      return Promise.resolve(r);
    }),
    single: vi.fn(() => {
      const r = getResult();
      return Promise.resolve(r);
    }),
    then: (onfulfilled: any, onrejected?: any) => {
      const r = getResult();
      return Promise.resolve(r).then(onfulfilled, onrejected);
    },
  };
  return chain;
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: null }, error: null })),
    },
    from: mockFrom,
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    from: mockFrom,
  })),
}));

import { GET, POST, PATCH } from './route';

describe('POST /api/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResults.length = 0;
    mockAuthenticateControllerDevice.mockResolvedValue(null);
  });

  const makeReq = (body: unknown, authorized = true) =>
    new Request('http://localhost/api/queue', {
      method: 'POST',
      headers: authorized
        ? { 'Content-Type': 'application/json', 'x-api-key': 'test-api-key' }
        : { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const validBody = {
    memberId: '550e8400-e29b-41d4-a716-446655440000',
    start: '2026-07-07T14:00:00Z',
    duration: 60,
    partySize: 2,
    playerIds: ['6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'f47ac10b-58cc-4372-a567-0e02b2c3d479'],
  };

  it('rejects queue mutations without controller or user authorization', async () => {
    const res = await POST(makeReq(validBody, false));
    expect(res.status).toBe(401);
    expect(mockJoinQueue).not.toHaveBeenCalled();
  });

  it('accepts queue mutations from an allowlisted kiosk device', async () => {
    mockAuthenticateControllerDevice.mockResolvedValue({ device_id: 'aabbccddeeff', device_type: 'kiosk', court_id: null });
    mockJoinQueue.mockResolvedValue({
      id: 'q-device', member_id: 'm1', status: 'waiting', court_id: null,
      duration: 60, party_size: 2, player_ids: ['p1'], created_at: new Date().toISOString(),
      requested_start: '2026-07-07T14:00:00Z', expires_at: null, updated_at: new Date().toISOString(),
    });
    mockGetQueuePosition.mockResolvedValue(1);
    mockGetEstimatedWait.mockReturnValue('Now');

    const res = await POST(new Request('http://localhost/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-device-id': 'aabbccddeeff' },
      body: JSON.stringify(validBody),
    }));

    expect(res.status).toBe(201);
    expect(mockJoinQueue).toHaveBeenCalled();
  });

  it('returns 400 on invalid payload', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it('returns 400 on invalid partySize', async () => {
    const res = await POST(makeReq({ ...validBody, partySize: 3 }));
    expect(res.status).toBe(400);
  });

  it('returns 201 with completed status when court is free', async () => {
    mockJoinQueue.mockResolvedValue({
      id: 'q1', member_id: 'm1', status: 'completed',
      court_id: 'court-1', duration: 60, party_size: 2,
      player_ids: ['p1', 'p2'], created_at: new Date().toISOString(),
      requested_start: '2026-07-07T14:00:00Z', expires_at: null, updated_at: new Date().toISOString(),
    });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('completed');
    expect(data.court_name).toBe('Court 1');
  });

  it('rejects with 409 if member already has an active queue entry', async () => {
    mockTableResults.queue_entries = [{ data: { id: 'existing-queue-1' }, error: null }];

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('already have an active spot in the queue');
    expect(mockJoinQueue).not.toHaveBeenCalled();
  });

  it('rejects with 400 if member is in an active game and requests duration > 60', async () => {
    mockTableResults.game_players = [{ data: [{ game_id: 'g-active' }], error: null }];
    mockTableResults.games = [
      { data: [], error: null }, // scheduled games check-in check
      {
        data: [{
          id: 'g-active',
          start_time: new Date(Date.now() - 10 * 60_000).toISOString(),
          duration: 60,
        }],
        error: null,
      },
    ];

    const res = await POST(makeReq({ ...validBody, duration: 120 }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Maximum duration is 60 minutes while currently playing a match');
    expect(mockJoinQueue).not.toHaveBeenCalled();
  });

  it('allows duration <= 60 when member is in an active game', async () => {
    mockTableResults.game_players = [{ data: [{ game_id: 'g-active' }], error: null }];
    mockTableResults.games = [
      { data: [], error: null }, // scheduled games check-in check
      {
        data: [{
          id: 'g-active',
          start_time: new Date(Date.now() - 10 * 60_000).toISOString(),
          duration: 60,
        }],
        error: null,
      },
    ];
    mockJoinQueue.mockResolvedValue({
      id: 'q-subsequent', member_id: 'm1', status: 'waiting', court_id: null,
      duration: 60, party_size: 2, player_ids: ['p1'], created_at: new Date().toISOString(),
      requested_start: '2026-07-07T14:00:00Z', expires_at: null, updated_at: new Date().toISOString(),
    });
    mockGetQueuePosition.mockResolvedValue(1);
    mockGetEstimatedWait.mockReturnValue('~30 min');

    const res = await POST(makeReq({ ...validBody, duration: 60 }));
    expect(res.status).toBe(201);
    expect(mockJoinQueue).toHaveBeenCalled();
  });

  it('returns 201 with waiting status when court is busy', async () => {
    mockJoinQueue.mockResolvedValue({
      id: 'q2', member_id: 'm1', status: 'waiting',
      court_id: null, duration: 60, party_size: 2,
      player_ids: ['p1', 'p2'], created_at: new Date().toISOString(),
      requested_start: '2026-07-07T14:00:00Z', expires_at: null, updated_at: new Date().toISOString(),
    });
    mockGetQueuePosition.mockResolvedValue(2);
    mockGetEstimatedWait.mockReturnValue('~60 min');

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('waiting');
    expect(data.position).toBe(2);
    expect(data.estimatedWait).toBe('~60 min');
  });

  it('returns 409 when member is already in queue', async () => {
    mockJoinQueue.mockRejectedValue(new Error('Already in queue'));
    const res = await POST(makeReq(validBody));
    const data = await res.json();
    expect(res.status).toBe(409);
    expect(data.error).toBe('Already in queue');
  });

  it('creates scheduled entry when start is in the future', async () => {
    const future = new Date(Date.now() + 86400000).toISOString();
    mockJoinQueue.mockResolvedValue({
      id: 'q3', member_id: 'm1', status: 'scheduled',
      court_id: null, duration: 60, party_size: 2,
      player_ids: ['p1'], created_at: new Date().toISOString(),
      requested_start: future, expires_at: null, updated_at: new Date().toISOString(),
    });
    const res = await POST(makeReq({ ...validBody, start: future }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('scheduled');
  });
});

describe('PATCH /api/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResults.length = 0;
  });

  it('returns 400 on invalid payload', async () => {
    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-api-key' },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it('accepts offer and returns court name', async () => {
    mockFinalizeBooking.mockResolvedValue({ success: true });
    mockSupabaseResults.push({ data: { court_id: 'court-1' }, error: null });
    mockSupabaseResults.push({ data: { name: 'Court 1' }, error: null });

    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', action: 'accept' }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.courtName).toBe('Court 1');
  });

  it('accept fails when finalizeBooking returns error', async () => {
    mockFinalizeBooking.mockResolvedValue({ success: false, error: 'Offer expired' });

    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', action: 'accept' }),
    }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Offer expired');
  });

  it('declines offer', async () => {
    mockDeclineOffer.mockResolvedValue(undefined);
    mockSupabaseResults.push({ data: { court_id: 'court-1' }, error: null });

    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'test-api-key' },
      body: JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', action: 'decline' }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockDeclineOffer).toHaveBeenCalled();
  });
});

describe('GET /api/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResults.length = 0;
  });

  it('returns 400 when memberId is missing', async () => {
    const res = await GET(new Request('http://localhost/api/queue'));
    expect(res.status).toBe(400);
  });

  it('returns queue entries for a member', async () => {
    const mockEntries = [{
      id: 'q1', member_id: 'm1', status: 'waiting',
      duration: 60, party_size: 2, created_at: new Date().toISOString(),
      requested_start: '2026-07-07T14:00:00Z', expires_at: null, updated_at: new Date().toISOString(),
      player_ids: ['p1'],
    }];
    mockSupabaseResults.push({ data: mockEntries, error: null });
    mockGetQueuePosition.mockResolvedValue(1);
    mockGetEstimatedWait.mockReturnValue('Now');

    const res = await GET(new Request('http://localhost/api/queue?memberId=m1', { headers: { 'x-api-key': 'test-api-key' } }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].position).toBe(1);
  });
});
