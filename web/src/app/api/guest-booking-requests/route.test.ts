import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const mockAdminClient = {
  from: vi.fn(),
};

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdminClient),
}));

vi.mock('@/lib/queue/booking-engine', () => ({
  isSlotAvailable: vi.fn(() => Promise.resolve(true)),
}));

describe('POST /api/guest-booking-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminClient.from.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({
            data: { hold_expires_at: new Date(Date.now() + 30 * 60000).toISOString(), status: 'Pending Confirmation' },
            error: null,
          })),
        })),
      })),
    });
  });

  it('rejects a booking that is more than 5 minutes in the past', async () => {
    const pastDate = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const req = new Request('http://localhost/api/guest-booking-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: 'John Doe',
        mobileNumber: '09123456789',
        courtId: 'court-1',
        start: pastDate,
        duration: 60,
        partySize: 2,
        paymentMethod: 'Walk-in',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('The selected time must be in the future.');
  });

  it('accepts a booking within the 5-minute grace period', async () => {
    // 2 minutes in the past (e.g. form filling latency or minor clock skew)
    const recentDate = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const req = new Request('http://localhost/api/guest-booking-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: 'John Doe',
        mobileNumber: '09123456789',
        courtId: 'court-1',
        start: recentDate,
        duration: 60,
        partySize: 2,
        paymentMethod: 'Walk-in',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.status).toBe('Pending Confirmation');
  });

  it('accepts a booking in the future', async () => {
    const futureDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const req = new Request('http://localhost/api/guest-booking-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        guestName: 'John Doe',
        mobileNumber: '09123456789',
        courtId: 'court-1',
        start: futureDate,
        duration: 60,
        partySize: 2,
        paymentMethod: 'Walk-in',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.referenceCode).toMatch(/^PP-/);
  });
});
