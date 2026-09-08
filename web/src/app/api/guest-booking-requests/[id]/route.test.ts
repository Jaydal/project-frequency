import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PATCH } from './route';

const mockAdminClient = {
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'admin', app_metadata: { role: 'admin' } } }, error: null })),
    },
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}));

vi.mock('@/lib/queue/booking-engine', () => ({
  isSlotAvailable: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('@/lib/display/publish-all', () => ({
  publishAllDisplays: vi.fn(() => Promise.resolve({ ok: true, failed: 0, total: 0 })),
}));

describe('PATCH /api/guest-booking-requests/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminClient.from.mockReturnValue({
      update: vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) })),
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: '123', status: 'Pending Confirmation', court_id: 'court1', party_size: 2, match_title: 'Test', duration: 60, start_time: new Date().toISOString() }, error: null })) })) })),
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'game-1' }, error: null })) })) })),
    });
  });

  it('declines a request successfully', async () => {
    const req = new Request('http://localhost/api/guest-booking-requests/123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'decline' }),
    });
    
    const context = { params: Promise.resolve({ id: '123' }) };
    const res = await PATCH(req as any, context);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('Declined');
  });

  it('rejects approval without proof of payment / payment reference', async () => {
    const req = new Request('http://localhost/api/guest-booking-requests/123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    
    const context = { params: Promise.resolve({ id: '123' }) };
    const res = await PATCH(req as any, context);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/Proof of payment/i);
  });

  it('approves a request and creates a game when proof of payment is provided', async () => {
    const req = new Request('http://localhost/api/guest-booking-requests/123', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'approve',
        paymentReference: 'GCASH-123456789',
        paymentMethod: 'E-wallet',
        paymentDetails: 'Paid via GCash to 0917-xxx-xxxx',
        amountPaid: 300,
      }),
    });
    
    const context = { params: Promise.resolve({ id: '123' }) };
    const res = await PATCH(req as any, context);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('Confirmed');
    expect(data.gameId).toBe('game-1');
  });
});
