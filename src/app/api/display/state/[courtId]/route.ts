import { NextResponse } from 'next/server';
import { ensureConnected, getDisplayState, getCourtStatus } from '@/lib/mqtt';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courtId: string }> },
) {
  const { courtId } = await params;
  ensureConnected();

  const display = getDisplayState(courtId);
  const status = getCourtStatus(courtId);

  if (!display) {
    return NextResponse.json({
      courtId,
      display: null,
      status: status ?? null,
      note: 'No display data received yet. Publish a message to see it here.',
    });
  }

  return NextResponse.json({
    courtId,
    display,
    status: status ?? null,
  });
}
