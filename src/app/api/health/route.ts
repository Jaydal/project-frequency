import { NextResponse } from 'next/server';
import { ensureConnected, isBrokerConnected, getCourtStatuses } from '@/lib/mqtt';
import { createClient } from '@/lib/supabase/server';

const started = Date.now();

export async function GET() {
  // Ensure MQTT client is initialized
  ensureConnected();

  const [broker, supabaseDb, courtStatuses] = await Promise.all([
    Promise.resolve(isBrokerConnected()),
    createClient()
      .then(sb => sb.from('courts').select('id').limit(1))
      .then(({ error }) => error ? `error: ${error.message}` : 'ok')
      .catch((e: Error) => `error: ${e.message}`),
    Promise.resolve(getCourtStatuses()),
  ]);

  const brokerOk = broker;
  const dbOk = supabaseDb === 'ok';
  const ok = brokerOk && dbOk;

  const status: Record<string, unknown> = {
    ok,
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - started) / 1000),
    memory: process.memoryUsage(),
    node: process.version,
    env: process.env.NODE_ENV ?? 'development',
    connections: {
      broker: broker ? 'connected' : 'disconnected',
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
