import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockJoinQueue = vi.hoisted(() => vi.fn());
const mockGetQueuePosition = vi.hoisted(() => vi.fn());
const mockGetEstimatedWait = vi.hoisted(() => vi.fn());
const mockAcceptOffer = vi.hoisted(() => vi.fn());
const mockDeclineOffer = vi.hoisted(() => vi.fn());
const mockSupabaseResults = vi.hoisted(() => [] as Array<{ data: any; error: any }>);

vi.mock('@/lib/queue/queue-service', () => ({
  joinQueue: mockJoinQueue,
  getQueuePosition: mockGetQueuePosition,
  getEstimatedWait: mockGetEstimatedWait,
}));

vi.mock('@/lib/queue/reservation-service', () => ({
  acceptOffer: mockAcceptOffer,
  declineOffer: mockDeclineOffer,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => {
      const chain: any = {
        select: vi.fn(() => chain),
        eq: vi.fn(() => chain),
        in: vi.fn(() => chain),
        order: vi.fn(() => chain),
        limit: vi.fn(() => chain),
        delete: vi.fn(() => chain),
        update: vi.fn(() => chain),
        single: vi.fn(() => {
          const r = mockSupabaseResults.shift() || { data: null, error: null };
          return Promise.resolve(r);
        }),
        then: (onfulfilled: any) => {
          const r = mockSupabaseResults.shift() || { data: null, error: null };
          return Promise.resolve(r).then(onfulfilled);
        },
      };
      return chain;
    }),
  })),
}));

import { GET, POST, PATCH } from './route';

describe('POST /api/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResults.length = 0;
  });

  const makeReq = (body: unknown) =>
    new Request('http://localhost/api/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const validBody = {
    memberId: '550e8400-e29b-41d4-a716-446655440000',
    start: '2026-07-07T14:00:00Z',
    duration: 60,
    partySize: 2,
    playerIds: ['6ba7b810-9dad-11d1-80b4-00c04fd430c8', 'f47ac10b-58cc-4372-a567-0e02b2c3d479'],
  };

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
    mockSupabaseResults.push({ data: { name: 'Court 1' }, error: null });

    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.status).toBe('completed');
    expect(data.court_name).toBe('Court 1');
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
});

describe('PATCH /api/queue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResults.length = 0;
  });

  it('returns 400 on invalid payload', async () => {
    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }));
    expect(res.status).toBe(400);
  });

  it('accepts offer and returns court name', async () => {
    mockAcceptOffer.mockResolvedValue({ success: true });
    mockSupabaseResults.push({ data: { court_id: 'court-1' }, error: null });
    mockSupabaseResults.push({ data: { name: 'Court 1' }, error: null });

    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: '550e8400-e29b-41d4-a716-446655440000', action: 'accept' }),
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.courtName).toBe('Court 1');
  });

  it('accept fails when acceptOffer returns error', async () => {
    mockAcceptOffer.mockResolvedValue({ success: false, error: 'Offer expired' });

    const res = await PATCH(new Request('http://localhost/api/queue', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
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

    const res = await GET(new Request('http://localhost/api/queue?memberId=m1'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].position).toBe(1);
  });
});
