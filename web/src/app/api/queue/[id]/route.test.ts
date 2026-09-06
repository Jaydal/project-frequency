import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseResult = vi.hoisted(() => ({ data: null as any, queueEntry: null as any, error: null as any }));
const mockPublishAllDisplays = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, failed: 0, total: 0 }));
const mockLeaveQueue = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const mockAuthenticateControllerDevice = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn(() => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: mockSupabaseResult.data, error: mockSupabaseResult.error })),
    maybeSingle: vi.fn(() => Promise.resolve({ data: mockSupabaseResult.queueEntry, error: mockSupabaseResult.error })),
    delete: vi.fn(() => chain),
    update: vi.fn(() => chain),
    then: (onfulfilled: any) => Promise.resolve({ data: mockSupabaseResult.data, error: mockSupabaseResult.error }).then(onfulfilled),
  };
  return chain;
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/display/publish-all', () => ({
  publishAllDisplays: (...args: any[]) => mockPublishAllDisplays(...args),
}));

vi.mock('@/lib/queue/queue-service', () => ({
  leaveQueue: mockLeaveQueue,
}));

vi.mock('@/lib/controller-device-auth', () => ({
  authenticateControllerDevice: mockAuthenticateControllerDevice,
}));

import { DELETE, PATCH } from './route';

const fakeCourt = { id: 'court-1', name: 'Court 1', status: 'Available' };
const fakeGame = {
  id: 'g1', court_id: 'court-1', match_type: '2v2', status: 'Scheduled',
  duration: 30, courts: fakeCourt, game_players: [],
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const authed = (url: string) => new Request(url, { headers: { 'X-API-Key': 'test-api-key' } });

describe('DELETE /api/queue/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResult.data = null;
    mockSupabaseResult.queueEntry = null;
    mockSupabaseResult.error = null;
    mockAuthenticateControllerDevice.mockResolvedValue(null);
  });

  it('deletes a Scheduled game and returns { ok: true }', async () => {
    mockSupabaseResult.data = fakeGame;

    const res = await DELETE(authed('http://localhost'), params('g1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockPublishAllDisplays).toHaveBeenCalled();
  });

  it('returns 404 when game is not found', async () => {
    mockSupabaseResult.data = null;

    const res = await DELETE(authed('http://localhost'), params('missing'));
    expect(res.status).toBe(404);
    expect(mockPublishAllDisplays).not.toHaveBeenCalled();
  });

  it('returns 404 when game is not in Scheduled status', async () => {
    mockSupabaseResult.data = { ...fakeGame, status: 'In Progress' };

    const res = await DELETE(authed('http://localhost'), params('g1'));
    expect(res.status).toBe(404);
  });

  it('cancels a waiting queue entry from an allowlisted kiosk device', async () => {
    mockAuthenticateControllerDevice.mockResolvedValue({ device_id: 'aabbccddeeff', device_type: 'kiosk', court_id: null });
    mockSupabaseResult.queueEntry = { id: 'q1', member_id: 'm1', status: 'waiting', deposit_tx_id: 'tx1', court_id: null };

    const res = await DELETE(new Request('http://localhost', { headers: { 'x-device-id': 'aabbccddeeff' } }), params('q1'));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, cancelled: 'queue_entry' });
    expect(mockLeaveQueue).toHaveBeenCalledWith('q1');
  });

  it('rejects cancellation for an unknown device', async () => {
    const res = await DELETE(new Request('http://localhost', { headers: { 'x-device-id': '112233445566' } }), params('q1'));

    expect(res.status).toBe(401);
    expect(mockLeaveQueue).not.toHaveBeenCalled();
  });

  it('returns conflict when a queue entry is not cancellable', async () => {
    mockAuthenticateControllerDevice.mockResolvedValue({ device_id: 'aabbccddeeff', device_type: 'kiosk', court_id: null });
    mockSupabaseResult.queueEntry = { id: 'q1', member_id: 'm1', status: 'completed', deposit_tx_id: null, court_id: null };

    const res = await DELETE(new Request('http://localhost', { headers: { 'x-device-id': 'aabbccddeeff' } }), params('q1'));

    expect(res.status).toBe(409);
    expect(mockLeaveQueue).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/queue/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResult.data = null;
    mockSupabaseResult.error = null;
  });

  it('promotes game to In Progress and republishes all displays', async () => {
    mockSupabaseResult.data = fakeGame;

    const res = await PATCH(authed('http://localhost'), params('g1'));
    expect(res.status).toBe(200);
    expect(mockPublishAllDisplays).toHaveBeenCalled();
  });

  it('extracts court number from court name correctly', async () => {
    mockSupabaseResult.data = {
      ...fakeGame,
      courts: { ...fakeCourt, name: 'Court 3' },
    };

    await PATCH(authed('http://localhost'), params('g1'));
    expect(mockPublishAllDisplays).toHaveBeenCalled();
  });

  it('returns 404 when game does not exist', async () => {
    mockSupabaseResult.data = null;

    const res = await PATCH(authed('http://localhost'), params('bad'));
    expect(res.status).toBe(404);
    expect(mockPublishAllDisplays).not.toHaveBeenCalled();
  });
});
