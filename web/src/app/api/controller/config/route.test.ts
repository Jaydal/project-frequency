import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const mocks = vi.hoisted(() => ({
  checkControllerKey: vi.fn(() => true),
  authenticateControllerDevice: vi.fn(() => null),
}));

vi.mock('@/lib/controller-auth', () => ({
  checkControllerKey: mocks.checkControllerKey,
}));

vi.mock('@/lib/controller-device-auth', () => ({
  authenticateControllerDevice: mocks.authenticateControllerDevice,
}));

describe('GET /api/controller/config', () => {
  beforeEach(() => {
    mocks.checkControllerKey.mockReturnValue(true);
    mocks.authenticateControllerDevice.mockResolvedValue(null);
    process.env.MQTT_BROKER_URL = 'mqtts://broker.example:8883';
    process.env.MQTT_USERNAME = 'device-user';
    process.env.MQTT_PASSWORD = 'device-password';
  });

  it('returns broker configuration only to an authenticated controller', async () => {
    const response = await GET(new Request('http://localhost/api/controller/config', { headers: { 'x-api-key': 'key' } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      broker: 'mqtts://broker.example:8883',
      username: 'device-user',
      password: 'device-password',
      boardTopic: 'freq/board',
      displayTopicPrefix: 'courts/',
      courtId: null,
    });
  });

  it('does not return a partial configuration', async () => {
    delete process.env.MQTT_PASSWORD;
    const response = await GET(new Request('http://localhost/api/controller/config'));
    expect(response.status).toBe(503);
  });

  it('accepts a pre-provisioned device without requiring a shared API key', async () => {
    mocks.checkControllerKey.mockReturnValue(false);
    mocks.authenticateControllerDevice.mockResolvedValue({
      device_id: 'aabbccddeeff',
      device_type: 'display',
      court_id: 'court-1',
    });

    const response = await GET(new Request('http://localhost/api/controller/config', {
      headers: { 'x-device-id': 'aabbccddeeff' },
    }));
    expect(response.status).toBe(200);
  });

  it('rejects an unknown device when no legacy key is supplied', async () => {
    mocks.checkControllerKey.mockReturnValue(false);
    const response = await GET(new Request('http://localhost/api/controller/config', {
      headers: { 'x-device-id': '112233445566' },
    }));
    expect(response.status).toBe(401);
  });
});
