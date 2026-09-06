import { NextResponse } from 'next/server';
import { connectMqtt, publishCommand } from '@/lib/mqtt';
import { requireStaffOrController } from '@/lib/auth/server-guards';

export async function POST(request: Request) {
  const auth = await requireStaffOrController(request);
  if (auth.response) return auth.response;
  const connected = await connectMqtt();
  if (!connected) {
    return NextResponse.json({ error: 'MQTT not connected' }, { status: 503 });
  }

  const { mac, action, courtId, display } = await request.json();
  if (!mac || !/^[0-9a-f]{12}$/.test(mac)) {
    return NextResponse.json({ error: 'mac must be a 12-char hex string' }, { status: 400 });
  }
  if (!action) {
    return NextResponse.json({ error: 'action is required' }, { status: 400 });
  }

  const validActions = ['SET_COURT_ID', 'OVERRIDE', 'CLEAR_OVERRIDE'];
  if (!validActions.includes(action)) {
    return NextResponse.json({ error: `action must be one of: ${validActions.join(', ')}` }, { status: 400 });
  }

  const command: Record<string, unknown> = { action };
  if (action === 'SET_COURT_ID') {
    if (!courtId) return NextResponse.json({ error: 'courtId required' }, { status: 400 });
    command.courtId = courtId;
  } else if (action === 'OVERRIDE') {
    if (!display) return NextResponse.json({ error: 'display payload required' }, { status: 400 });
    command.display = display;
  }

  publishCommand(mac, command);

  return NextResponse.json({ ok: true });
}
