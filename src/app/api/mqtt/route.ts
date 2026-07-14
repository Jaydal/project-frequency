import { NextResponse } from 'next/server';
import { ensureConnected, isBrokerConnected, getCourtStatuses, getAllDisplayStates } from '@/lib/mqtt';

export async function GET() {
  const connected = await ensureConnected();
  return NextResponse.json({
    connected,
    courts: getCourtStatuses(),
    displays: getAllDisplayStates(),
  });
}
