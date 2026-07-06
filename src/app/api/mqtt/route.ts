import { NextResponse } from 'next/server';
import { ensureConnected, isBrokerConnected, getCourtStatuses, getAllDisplayStates } from '@/lib/mqtt';

export async function GET() {
  ensureConnected();
  return NextResponse.json({
    connected: isBrokerConnected(),
    courts: getCourtStatuses(),
    displays: getAllDisplayStates(),
  });
}
