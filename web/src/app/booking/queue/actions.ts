'use server';

import { createClient } from '@/lib/supabase/server';
import { getBoardSnapshot } from '@/lib/queue/board-snapshot';
import { leaveQueue } from '@/lib/queue/queue-service';

export async function fetchBoardSnapshot() {
  const supabase = await createClient();
  return getBoardSnapshot(supabase);
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
