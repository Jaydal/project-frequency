import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSupabaseResult = vi.hoisted(() => ({ data: null, error: null }));
const mockPublishDisplay = vi.hoisted(() => vi.fn());
const mockFrom = vi.hoisted(() => vi.fn(() => {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    single: vi.fn(() => Promise.resolve({ data: mockSupabaseResult.data, error: mockSupabaseResult.error })),
    delete: vi.fn(() => chain),
    update: vi.fn(() => chain),
    then: (onfulfilled: any) => Promise.resolve({ data: mockSupabaseResult.data, error: mockSupabaseResult.error }).then(onfulfilled),
  };
  return chain;
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}));

vi.mock('@/lib/mqtt', () => ({
  publishDisplay: (...args: any[]) => mockPublishDisplay(...args),
}));

import { DELETE, PATCH } from './route';

const fakeCourt = { id: 'court-1', name: 'Court 1', status: 'Available' };
const fakeGame = {
  id: 'g1', court_id: 'court-1', match_type: '2v2', status: 'Scheduled',
  duration: 30, courts: fakeCourt, game_players: [],
};

const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('DELETE /api/queue/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResult.data = null;
    mockSupabaseResult.error = null;
  });

  it('deletes a Scheduled game and returns { ok: true }', async () => {
    mockSupabaseResult.data = fakeGame;

    const res = await DELETE(new Request('http://localhost'), params('g1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('returns 404 when game is not found', async () => {
    mockSupabaseResult.data = null;

    const res = await DELETE(new Request('http://localhost'), params('missing'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when game is not in Scheduled status', async () => {
    mockSupabaseResult.data = { ...fakeGame, status: 'In Progress' };

    const res = await DELETE(new Request('http://localhost'), params('g1'));
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/queue/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseResult.data = null;
    mockSupabaseResult.error = null;
  });

  it('promotes game to In Progress and calls publishDisplay', async () => {
    mockSupabaseResult.data = fakeGame;
    mockPublishDisplay.mockResolvedValue(undefined);

    const res = await PATCH(new Request('http://localhost'), params('g1'));
    expect(res.status).toBe(200);
    expect(mockPublishDisplay).toHaveBeenCalledWith('court-1', {
      line1: 'COURT 1',
      line2: '2v2',
      line3: 'RUNNING',
    });
  });

  it('extracts court number from court name correctly', async () => {
    mockSupabaseResult.data = {
      ...fakeGame,
      courts: { ...fakeCourt, name: 'Court 3' },
    };
    mockPublishDisplay.mockResolvedValue(undefined);

    await PATCH(new Request('http://localhost'), params('g1'));
    expect(mockPublishDisplay).toHaveBeenCalledWith('court-1', {
      line1: 'COURT 3',
      line2: '2v2',
      line3: 'RUNNING',
    });
  });

  it('returns 404 when game does not exist', async () => {
    mockSupabaseResult.data = null;

    const res = await PATCH(new Request('http://localhost'), params('bad'));
    expect(res.status).toBe(404);
  });
});
