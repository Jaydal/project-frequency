import { createClient } from '@/lib/supabase/server';
import { isSlotAvailable } from './booking-engine';
import { publishDisplay } from '@/lib/mqtt';
import { QUEUE_DEFAULT_TIMEOUT_MIN } from './index';

let expiryInterval: ReturnType<typeof setInterval> | null = null;

export function startExpiryProcessor(): void {
  if (expiryInterval) return;
  expiryInterval = setInterval(processExpiredOffers, 30_000);
  processExpiredOffers();
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

  const { data: waiting } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (!waiting || waiting.length === 0) {
    await publishDisplay(courtId, {
      line1: 'COURT AVAILABLE',
      line2: '',
      line3: 'READY FOR NEXT GAME',
    });
    return;
  }

  for (const entry of waiting) {
    const start = new Date(entry.requested_start);
    const end = new Date(start.getTime() + entry.duration * 60_000);
    const available = await isSlotAvailable(courtId, start, end);

    if (available) {
      const expiresAt = new Date(Date.now() + QUEUE_DEFAULT_TIMEOUT_MIN * 60_000);
      await supabase
        .from('queue_entries')
        .update({
          status: 'offered',
          court_id: courtId,
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', entry.id);

      await publishDisplay(courtId, {
        line1: 'COURT AVAILABLE',
        line2: `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')} – ${end.getHours().toString().padStart(2, '0')}:${end.getMinutes().toString().padStart(2, '0')}`,
        line3: 'PLEASE CONFIRM AT TERMINAL',
      });

      return;
    }
  }

  await publishDisplay(courtId, {
    line1: 'COURT AVAILABLE',
    line2: '',
    line3: 'WAITING FOR COMPATIBLE QUEUE',
  });
}
