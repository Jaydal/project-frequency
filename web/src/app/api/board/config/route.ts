import { NextResponse } from 'next/server';

export async function GET() {
  // Never expose server-side broker credentials to browsers. If browser MQTT
  // is required, provision a separately scoped public broker identity.
  const brokerUrl = process.env.NEXT_PUBLIC_MQTT_BROKER_URL || '';
  const username = process.env.NEXT_PUBLIC_MQTT_USERNAME || '';
  const password = process.env.NEXT_PUBLIC_MQTT_PASSWORD || '';

  if (!brokerUrl || !username || !password) {
    return NextResponse.json({ enabled: false });
  }

  const wsUrl = brokerUrl
    .replace(/^mqtts:\/\//, 'wss://')
    .replace(/:8883$/, ':8884') + '/mqtt';

  return NextResponse.json({
    enabled: true,
    url: wsUrl,
    username,
    password,
    topic: 'freq/board',
  });
}
