import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  checkControllerKey: vi.fn(),
  authenticateControllerDevice: vi.fn(),
  getRfidFormats: vi.fn(() => ['aabbccddeeff']),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/controller-auth', () => ({ checkControllerKey: mocks.checkControllerKey }));
vi.mock('@/lib/controller-device-auth', () => ({ authenticateControllerDevice: mocks.authenticateControllerDevice }));
vi.mock('@/lib/rfid', () => ({ getRfidFormats: mocks.getRfidFormats }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }));

import { GET } from './route';

function makeAdmin(data: unknown) {
  const chain: any = {
    select: vi.fn(() => chain),
    in: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve({ data, error: null })),
    then: (resolve: any, reject?: any) => Promise.resolve({ data: [], error: null }).then(resolve, reject),
  };
  mocks.createAdminClient.mockReturnValue({ from: vi.fn(() => chain) });
}

describe('GET /api/controller/member/[rfid]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkControllerKey.mockReturnValue(false);
    mocks.authenticateControllerDevice.mockResolvedValue(null);
  });

  it('accepts a pre-provisioned kiosk without a shared API key', async () => {
    mocks.authenticateControllerDevice.mockResolvedValue({ device_id: 'aabbccddeeff', device_type: 'kiosk', court_id: null });
    makeAdmin({
      status: 'Active',
      members: { id: 'member-1', member_id: 'PP-001', first_name: 'Test', last_name: 'Player', status: 'Active', wallets: { balance: 100 } },
    });

    const response = await GET(new Request('http://localhost/api/controller/member/aabbccddeeff', { headers: { 'x-device-id': 'aabbccddeeff' } }), { params: Promise.resolve({ rfid: 'aabbccddeeff' }) });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.decision.type).toBe('play now');
    expect(body.decision.gameId).toBeUndefined();
    expect(body.decision.entryId).toBeUndefined();
    expect(body.activeGame).toBeNull();
    expect(body.activeQueue).toBeNull();
  });

  it('rejects unknown devices before looking up an RFID card', async () => {
    makeAdmin(null);

    const response = await GET(new Request('http://localhost/api/controller/member/aabbccddeeff'), { params: Promise.resolve({ rfid: 'aabbccddeeff' }) });

    expect(response.status).toBe(401);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
