import { NextResponse } from 'next/server';
import { checkControllerKey } from '@/lib/controller-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';

export async function GET(request: Request) {
  const device = await authenticateControllerDevice(request);
  // Legacy API-key authentication is retained temporarily for already
  // deployed devices while the allowlist is populated.
  if (!device && !checkControllerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const broker = process.env.MQTT_BROKER_URL;
  const username = process.env.MQTT_USERNAME;
  const password = process.env.MQTT_PASSWORD;
  if (!broker || !username || !password) {
    return NextResponse.json({ error: 'MQTT configuration unavailable' }, { status: 503 });
  }

  return NextResponse.json({
    broker,
    username,
    password,
    boardTopic: 'freq/board',
    displayTopicPrefix: 'courts/',
    courtId: device?.court_id ?? null,
  }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
