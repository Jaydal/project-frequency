import { NextResponse } from 'next/server';
import { processExpiredGames } from '@/lib/queue/queue-processor';
import { publishBoardOnce } from '@/lib/queue/board-publisher';

export const dynamic = 'force-dynamic';

let lastTickTime = 0;

export async function GET() {
  const now = Date.now();
  if (now - lastTickTime < 3000) {
    return NextResponse.json({ ok: true, skipped: true });
  }
  lastTickTime = now;

  try {
    await processExpiredGames();
    await publishBoardOnce();

    return NextResponse.json({ ok: true, timestamp: new Date(now).toISOString() });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error('Queue processing failed:', errorMsg);
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
