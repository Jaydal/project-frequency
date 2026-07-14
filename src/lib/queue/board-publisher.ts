import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getBoardSnapshot } from './board-snapshot';
import { publishBoard } from '@/lib/mqtt';

/* Periodically snapshots the live board and pushes it to MQTT (`freq/board`)
 * for the firmware kiosk. Runs server-side only. Uses a plain (cookie-free)
 * Supabase client with the publishable/anon key so it works in a background
 * timer with no request context — the board tables are the same ones the web
 * app reads client-side with that key. The kiosk advances court/offer timers
 * locally from startTime/expiresAt, so a slow cadence stays real-time. */

const PUBLISH_INTERVAL_MS = 3000;

let g = globalThis as typeof globalThis & {
  _boardPublisherStarted?: boolean;
  _boardServiceClient?: SupabaseClient;
};

function serviceClient(): SupabaseClient | null {
  if (g._boardServiceClient) return g._boardServiceClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  g._boardServiceClient = createClient(url, key, { auth: { persistSession: false } });
  return g._boardServiceClient;
}

export async function publishBoardOnce(): Promise<void> {
  const supabase = serviceClient();
  if (!supabase) return;
  try {
    const snapshot = await getBoardSnapshot(supabase);
    await publishBoard(JSON.stringify(snapshot));
  } catch (err) {
    console.error('[board-publisher]', err instanceof Error ? err.message : err);
  }
}

export function startBoardPublisher(): void {
  if (g._boardPublisherStarted) return;
  g._boardPublisherStarted = true;
  publishBoardOnce();
  setInterval(publishBoardOnce, PUBLISH_INTERVAL_MS);
  console.log('[board-publisher] started');
}
