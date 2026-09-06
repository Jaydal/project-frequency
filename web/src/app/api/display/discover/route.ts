import { NextResponse } from 'next/server';
import { connectMqtt, collectDiscoveryResponses } from '@/lib/mqtt';
import { requireStaffOrController } from '@/lib/auth/server-guards';

export async function POST(request: Request) {
  const auth = await requireStaffOrController(request);
  if (auth.response) return auth.response;
  const connected = await connectMqtt();
  if (!connected) {
    return NextResponse.json({ error: 'MQTT not connected' }, { status: 503 });
  }

  const displays = await collectDiscoveryResponses(3000);

  return NextResponse.json({ displays });
}
