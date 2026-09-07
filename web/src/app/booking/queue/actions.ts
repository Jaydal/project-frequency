'use server';

import { createClient } from '@/lib/supabase/server';
import { getBoardSnapshot } from '@/lib/queue/board-snapshot';
import { leaveQueue } from '@/lib/queue/queue-service';
import { processAllCourts } from '@/lib/queue/queue-processor';
import { publishAllDisplays } from '@/lib/display/publish-all';

export async function fetchBoardSnapshot() {
  const supabase = await createClient();
  const snapshot = await getBoardSnapshot(supabase);

  // Reconcile in background if any court has an expired game or if there are waiters and an open court
  const hasExpiredGame = snapshot.courts.some(
    (c) => c.startTime > 0 && c.startTime + c.durationMin * 60 <= snapshot.serverTime
  );
  const hasWaitersWithOpenCourt =
    snapshot.queue.length > 0 &&
    snapshot.courts.some((c) => c.startTime === 0 || c.startTime + c.durationMin * 60 <= snapshot.serverTime);

  if (hasExpiredGame || hasWaitersWithOpenCourt) {
    processAllCourts()
      .then(() => publishAllDisplays())
      .catch(console.error);
  }

  return snapshot;
}

export async function cancelQueueEntry(entryId: string) {
  try {
    await leaveQueue(entryId);
    return { ok: true };
  } catch (err) {
    console.error('cancelQueueEntry failed:', err);
    return { ok: false, error: err instanceof Error ? err.message : 'Cancel failed' };
  }
}
