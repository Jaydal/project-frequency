import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAdmin = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => mockAdmin),
}));

import { authenticateControllerDevice } from './controller-device-auth';

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    update: vi.fn(() => chain),
  };
  return chain;
}

describe('authenticateControllerDevice', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects malformed device ids before querying Supabase', async () => {
    const result = await authenticateControllerDevice(new Request('http://localhost', { headers: { 'x-device-id': 'not-a-device' } }));
    expect(result).toBeNull();
    expect(mockAdmin.from).not.toHaveBeenCalled();
  });

  it('returns an enabled device and updates its last-seen timestamp', async () => {
    const chain = makeChain({ data: { device_id: 'aabbccddeeff', device_type: 'kiosk', court_id: null }, error: null });
    mockAdmin.from.mockReturnValue(chain);

    const result = await authenticateControllerDevice(new Request('http://localhost', { headers: { 'x-device-id': 'AABBCCDDEEFF' } }), 'kiosk');

    expect(result?.device_type).toBe('kiosk');
    expect(chain.update).toHaveBeenCalled();
  });

  it('rejects a device with the wrong required type', async () => {
    const chain = makeChain({ data: { device_id: 'aabbccddeeff', device_type: 'display', court_id: 'court-1' }, error: null });
    mockAdmin.from.mockReturnValue(chain);

    const result = await authenticateControllerDevice(new Request('http://localhost', { headers: { 'x-device-id': 'aabbccddeeff' } }), 'kiosk');

    expect(result).toBeNull();
    expect(chain.update).not.toHaveBeenCalled();
  });

  it('rejects simulator device id when NODE_ENV is production', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const result = await authenticateControllerDevice(new Request('http://localhost', { headers: { 'x-device-id': 'simulator' } }), 'kiosk');
      expect(result).toBeNull();
      expect(mockAdmin.from).not.toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('allows simulator device id when NODE_ENV is not production', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    try {
      const chain = makeChain({ data: { device_id: 'simulator', device_type: 'kiosk', court_id: null }, error: null });
      mockAdmin.from.mockReturnValue(chain);

      const result = await authenticateControllerDevice(new Request('http://localhost', { headers: { 'x-device-id': 'simulator' } }), 'kiosk');
      expect(result?.device_type).toBe('kiosk');
      expect(chain.update).toHaveBeenCalled();
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });
});
