import { createClient } from '@/lib/supabase/server';
import { isSlotAvailable } from './booking-engine';
import { publishDisplay } from '@/lib/mqtt';
import { generatePayload } from '@/lib/display/sports-caster';
import { QUEUE_DEFAULT_TIMEOUT_MS } from './index';
import { effectivePrepSec } from '@/lib/products-config-types';

let expiryInterval: ReturnType<typeof setInterval> | null = null;

export function startExpiryProcessor(): void {
  if (expiryInterval) return;
  expiryInterval = setInterval(() => {
    processExpiredOffers();
    processExpiredGames();
  }, 30_000);
  processExpiredOffers();
  processExpiredGames();
}

export async function processExpiredOffers(): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { data: expired } = await supabase
    .from('queue_entries')
    .select('id, court_id')
    .eq('status', 'offered')
    .lt('expires_at', now);

  if (!expired || expired.length === 0) return;

  for (const entry of expired) {
    await supabase
      .from('queue_entries')
      .update({ status: 'expired', updated_at: now })
      .eq('id', entry.id);

    if (entry.court_id) {
      await processCourt(entry.court_id);
    }
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
    .order('created_at', { ascending: true });

  if (!waiting || waiting.length === 0) {
    await publishDisplay(courtId, generatePayload(courtId, { current: null, upcoming: [] }));
    return;
  }

  for (const entry of waiting) {
    if (entry.court_id && entry.court_id !== courtId) {
      continue;
    }
    const start = new Date(entry.requested_start);
    const effectivePrep = effectivePrepSec(entry.duration, prepSec);
    const end = new Date(start.getTime() + effectivePrep * 1000 + entry.duration * 60_000);
    const available = await isSlotAvailable(courtId, start, end);

    if (available) {
      const expiresAt = new Date(Date.now() + QUEUE_DEFAULT_TIMEOUT_MS);
      await supabase
        .from('queue_entries')
        .update({
          status: 'offered',
          court_id: courtId,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);

      await publishDisplay(courtId, generatePayload(courtId, { current: null, upcoming: [] }));

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
