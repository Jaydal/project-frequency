import { NextResponse } from 'next/server';
import { ensureConnected, isBrokerConnected, getCourtStatuses } from '@/lib/mqtt';
import { createClient } from '@/lib/supabase/server';

const started = Date.now();

export async function GET() {
  // Ensure MQTT client is initialized
  const brokerOk = await ensureConnected();

  const [supabaseDb, courtStatuses] = await Promise.all([
    createClient()
      .then(sb => sb.from('courts').select('id').limit(1))
      .then(({ error }) => error ? `error: ${error.message}` : 'ok')
      .catch((e: Error) => `error: ${e.message}`),
    Promise.resolve(getCourtStatuses()),
  ]);

  const dbOk = supabaseDb === 'ok';
  
  // Return 200 if the database is online, even if MQTT is down.
  // We don't want to fail the kiosk/web UI just because physical panels are disconnected.
  const ok = dbOk;

  const status: Record<string, unknown> = {
    ok,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - started) / 1000),
    memory: process.memoryUsage(),
    node: process.version,
    env: process.env.NODE_ENV ?? 'development',
    connections: {
      broker: brokerOk ? 'connected' : 'disconnected',
      supabase: supabaseDb,
    },
    courtDevices: Object.fromEntries(
      Object.entries(courtStatuses).map(([id, s]) => [id, {
        status: s.status,
        ip: s.ip,
        rssi: s.rssi,
        court: s.court,
        seenAt: s.seenAt,
        ago: `${Math.floor((Date.now() - s.seenAt) / 1000)}s`,
      }]),
    ),
  };

  return NextResponse.json(status, { status: ok ? 200 : 503 });
}
