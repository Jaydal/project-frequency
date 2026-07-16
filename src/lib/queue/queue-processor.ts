import { createClient } from '@/lib/supabase/server';
import { isSlotAvailable } from './booking-engine';
import { publishDisplay } from '@/lib/mqtt';
import { generatePayload } from '@/lib/display/sports-caster';
import { effectivePrepSec } from '@/lib/products-config-types';
import { acceptOffer } from './reservation-service';

// W2: Store interval on globalThis to survive hot-reload without leaking.
const g = global as typeof globalThis & {
  _queueExpiryInterval?: ReturnType<typeof setInterval>;
};

export function startExpiryProcessor(): void {
  if (g._queueExpiryInterval) return;
  g._queueExpiryInterval = setInterval(() => {
    processExpiredGames().catch((err) => console.error('[queue-processor] Expiry cycle failed:', err));
  }, 30_000);
  processExpiredGames().catch((err) => console.error('[queue-processor] Startup expiry failed:', err));
}

export function stopExpiryProcessor(): void {
  if (g._queueExpiryInterval) {
    clearInterval(g._queueExpiryInterval);
    g._queueExpiryInterval = undefined;
  }
}

export async function processCourt(courtId: string): Promise<void> {
  const supabase = await createClient();

  const { data: settings } = await supabase.from('settings').select('value').eq('key', 'preparationTime').single();
  const rawPrepSec = parseInt(settings?.value ?? '300', 10);
  const prepSec = isNaN(rawPrepSec) ? 300 : rawPrepSec;

  const { data: waiting } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('status', 'waiting')
    .or(`court_id.eq.${courtId},court_id.is.null`)
    .order('created_at', { ascending: true });

  if (!waiting || waiting.length === 0) {
    await publishDisplay(courtId, generatePayload(courtId, { current: null, upcoming: [] }));
    return;
  }

  for (const entry of waiting) {
    const start = new Date(entry.requested_start);
    const effectivePrep = effectivePrepSec(entry.duration, prepSec);
    const end = new Date(start.getTime() + effectivePrep * 1000 + entry.duration * 60_000);
    const available = await isSlotAvailable(courtId, start, end);

    if (available) {
      const { data: freshEntry } = await supabase
        .from('queue_entries')
        .select('status')
        .eq('id', entry.id)
        .single();

      if (!freshEntry || freshEntry.status !== 'waiting') {
        continue;
      }

      const { data: claimed } = await supabase
        .from('queue_entries')
        .update({ status: 'accepted', court_id: courtId, updated_at: new Date().toISOString() })
        .eq('id', entry.id)
        .eq('status', 'waiting')
        .select();

      if (claimed && claimed.length > 0) {
        const result = await acceptOffer(entry.id, { bookCourt: true });
        if (!result.success) {
          console.error(`[queue-processor] Auto-book failed for entry ${entry.id}:`, result.error);
        }
      }

      return;
    }
  }

  await publishDisplay(courtId, generatePayload(courtId, { current: null, upcoming: [] }));
}

export async function processExpiredGames(): Promise<void> {
  const supabase = await createClient();
  const now = new Date();

  const { data: settings } = await supabase.from('settings').select('value').eq('key', 'preparationTime').single();
  const rawPrepSec = parseInt(settings?.value ?? '300', 10);
  const prepSec = isNaN(rawPrepSec) ? 300 : rawPrepSec;

  const { data: active } = await supabase
    .from('games')
    .select('id, court_id, start_time, duration')
    .eq('status', 'In Progress');

  if (!active) return;

  for (const game of active) {
    if (!game.start_time) continue;
    const effectivePrep = effectivePrepSec(game.duration, prepSec);
    const end = new Date(new Date(game.start_time).getTime() + effectivePrep * 1000 + game.duration * 60_000);
    if (end > now) continue;

    await supabase
      .from('games')
      .update({ status: 'Completed', end_time: end.toISOString() })
      .eq('id', game.id);

    await supabase
      .from('courts')
      .update({ status: 'Available', last_activity: now.toISOString() })
      .eq('id', game.court_id);

    await processCourt(game.court_id);
  }
}
