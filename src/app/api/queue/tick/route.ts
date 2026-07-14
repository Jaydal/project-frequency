import { NextResponse } from 'next/server';
import { processExpiredGames, processExpiredOffers } from '@/lib/queue/queue-processor';

export const dynamic = 'force-dynamic';

let lastTickTime = 0;

export async function GET() {
  const now = Date.now();
  // Throttle ticks to once every 3 seconds to avoid redundant database pressure
  if (now - lastTickTime < 3000) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  lastTickTime = now;

  try {
    // Process game and offer expirations
    await Promise.allSettled([
      processExpiredGames(),
      processExpiredOffers()
    ]);
    return NextResponse.json({ ok: true, timestamp: new Date(now).toISOString() });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Queue processing failed:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
