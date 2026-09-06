import { type SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { getBoardSnapshot, getBoardSnapshotSignature } from './board-snapshot';
import { publishBoard } from '@/lib/mqtt';

let g = globalThis as typeof globalThis & {
  _boardServiceClient?: SupabaseClient;
  _boardSnapshotSignature?: string;
};

function serviceClient(): SupabaseClient | null {
  if (g._boardServiceClient) return g._boardServiceClient;
  try {
    g._boardServiceClient = createAdminClient();
  } catch {
    return null;
  }
  return g._boardServiceClient;
}

export async function publishBoardOnce(): Promise<void> {
  const supabase = serviceClient();
  if (!supabase) return;
  try {
    const snapshot = await getBoardSnapshot(supabase);
    const signature = getBoardSnapshotSignature(snapshot);
    if (g._boardSnapshotSignature === signature) return;
    await publishBoard(JSON.stringify(snapshot));
    g._boardSnapshotSignature = signature;
  } catch (err) {
    console.error('[board-publisher]', err instanceof Error ? err.message : err);
  }
}
