import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequireStaff = vi.hoisted(() => vi.fn());
const mockAdmin = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('@/lib/auth/server-guards', () => ({
  requireStaff: mockRequireStaff,
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

import { GET, POST } from './route';
import { PATCH, DELETE } from './[id]/route';
import { NextResponse } from 'next/server';

function makeChain(result: { data: unknown; error: unknown; count?: number }) {
  const chain: any = {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
    delete: vi.fn(() => chain),
    order: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (onfulfilled: any) => Promise.resolve(result).then(onfulfilled),
  };
  return chain;
}

describe('/api/devices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireStaff.mockResolvedValue({
      supabase: {},
      user: { id: 'staff-1', user_metadata: { role: 'admin' } },
      response: undefined,
    });
  });

  describe('Authorization', () => {
    it('rejects unauthenticated or non-staff requests', async () => {
      mockRequireStaff.mockResolvedValueOnce({
        supabase: {},
        user: null,
        response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
      });

      const res = await GET();
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/devices', () => {
    it('returns list of registered devices and available courts', async () => {
      const mockList = [
        {
          device_id: 'aabbccddeeff',
          device_type: 'kiosk',
          court_id: null,
          enabled: true,
          last_seen_at: '2026-09-01T00:00:00Z',
          created_at: '2026-09-01T00:00:00Z',
          courts: null,
        },
      ];
      mockAdmin.from.mockImplementation((table: string) => {
        if (table === 'controller_devices') return makeChain({ data: mockList, error: null });
        if (table === 'courts') return makeChain({ data: [{ id: 'court-1', name: 'Court 1' }], error: null });
        return makeChain({ data: [], error: null });
      });

      const res = await GET();
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.devices).toHaveLength(1);
      expect(json.devices[0].deviceId).toBe('aabbccddeeff');
      expect(json.courts).toHaveLength(1);
      expect(json.courts[0].name).toBe('Court 1');
    });
  });

  describe('POST /api/devices', () => {
    it('rejects invalid device IDs', async () => {
      const req = new Request('http://localhost/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'invalid-mac', deviceType: 'kiosk' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid Device ID');
    });

    it('rejects simulator device in production', async () => {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      try {
        const req = new Request('http://localhost/api/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: 'simulator', deviceType: 'kiosk' }),
        });

        const res = await POST(req);
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.error).toContain('Simulator device ID cannot be registered in production');
      } finally {
        process.env.NODE_ENV = origEnv;
      }
    });

    it('normalizes formatted MAC address and registers successfully', async () => {
      const inserted = {
        device_id: 'aabbccddeeff',
        device_type: 'kiosk',
        court_id: null,
        enabled: true,
        created_at: '2026-09-01T00:00:00Z',
        courts: null,
      };
      const chain = makeChain({ data: inserted, error: null });
      mockAdmin.from.mockReturnValue(chain);

      const req = new Request('http://localhost/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'AA:BB:CC:DD:EE:FF', deviceType: 'kiosk' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.device.deviceId).toBe('aabbccddeeff');
      expect(chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        device_id: 'aabbccddeeff',
        device_type: 'kiosk',
      }));
    });
  });

  describe('PATCH /api/devices/[id]', () => {
    it('updates device enabled status', async () => {
      const updated = {
        device_id: 'aabbccddeeff',
        device_type: 'kiosk',
        court_id: null,
        enabled: false,
        last_seen_at: null,
        created_at: '2026-09-01T00:00:00Z',
        courts: null,
      };
      const chain = makeChain({ data: updated, error: null });
      mockAdmin.from.mockReturnValue(chain);

      const req = new Request('http://localhost/api/devices/aabbccddeeff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      });

      const res = await PATCH(req, { params: Promise.resolve({ id: 'aa:bb:cc:dd:ee:ff' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.device.enabled).toBe(false);
      expect(chain.update).toHaveBeenCalledWith({ enabled: false });
    });
  });

  describe('DELETE /api/devices/[id]', () => {
    it('deletes registered device', async () => {
      const chain = makeChain({ data: null, error: null, count: 1 });
      mockAdmin.from.mockReturnValue(chain);

      const req = new Request('http://localhost/api/devices/aabbccddeeff', {
        method: 'DELETE',
      });

      const res = await DELETE(req, { params: Promise.resolve({ id: 'aabbccddeeff' }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(chain.delete).toHaveBeenCalled();
    });
  });
});
