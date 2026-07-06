import { createClient } from '@/lib/supabase/client';
import { effectivePrepSec } from '@/lib/products-config-types';
import { QUEUE_DEFAULT_TIMEOUT_MS } from '@/lib/queue/index';

export async function processExpiredOffers(): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();

  const { data: expired } = await supabase
    .from('queue_entries')
    .select('id, court_id')
    .eq('status', 'offered')
    .lt('expires_at', now);

  if (!expired || expired.length === 0) return;

  for (const entry of expired) {
    if (entry.court_id) {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: entry.id, action: 'accept' }),
      });
    }
  }
}

export async function processExpiredGames(): Promise<void> {
  const supabase = createClient();
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

    await offerNextInQueue(game.court_id);
  }
}

export async function processAvailableCourts(): Promise<void> {
  const supabase = createClient();
  const now = new Date();

  const { data: available } = await supabase
    .from('courts')
    .select('id')
    .eq('status', 'Available');

  if (!available || available.length === 0) return;

  const { data: waiting } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (!waiting || waiting.length === 0) return;

  for (const court of available) {
    await offerNextInQueue(court.id);
  }
}

async function offerNextInQueue(courtId: string): Promise<void> {
  const supabase = createClient();

  const { data: waiting } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(1);

  if (!waiting || waiting.length === 0) return;

  const expiresAt = new Date(Date.now() + QUEUE_DEFAULT_TIMEOUT_MS);
  await supabase
    .from('queue_entries')
    .update({
      status: 'offered',
      court_id: courtId,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', waiting[0].id);
}

export async function publishCourtDisplays(): Promise<void> {
  try {
    await fetch('/api/display/publish-all', { method: 'POST' });
  } catch {}
}
