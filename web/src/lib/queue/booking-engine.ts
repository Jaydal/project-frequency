import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isOverlapping, type CourtInfo } from './index';


export async function findAvailableCourt(
  requestedStart: Date,
  duration: number,
  partySize: number,
  excludeCourtId?: string
): Promise<CourtInfo | null> {
  const supabase = await createClient();
  const end = new Date(requestedStart.getTime() + duration * 60_000);

  const { data: courts } = await supabase
    .from('courts')
    .select('*')
    .order('name', { ascending: true });

  if (!courts) return null;

  for (const court of courts) {
    if (court.status === 'Maintenance' || court.status === 'Closed') continue;
    if (excludeCourtId && court.id === excludeCourtId) continue;
    const slotFree = await isSlotAvailable(court.id, requestedStart, end);
    if (slotFree) return { id: court.id, name: court.name, status: court.status };
  }

  return null;
}

export async function isSlotAvailable(
  courtId: string,
  start: Date,
  end: Date,
  excludeQueueEntryId?: string,
  client?: SupabaseClient
): Promise<boolean> {
  const supabase = client ?? await createClient();

  const { data: overlapping } = await supabase
    .from('games')
    .select('id')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .gte('start_time', start.toISOString())
    .lt('start_time', end.toISOString());

  if (overlapping && overlapping.length > 0) return false;

  // Also check if there are any active offers for this court that overlap
  const { data: offered } = await supabase
    .from('queue_entries')
    .select('id, requested_start, duration, expires_at')
    .eq('court_id', courtId)
    .eq('status', 'offered');
  
  if (offered && offered.length > 0) {
    for (const offer of offered) {
      if (excludeQueueEntryId && offer.id === excludeQueueEntryId) continue;
      if (offer.expires_at && new Date(offer.expires_at).getTime() <= start.getTime()) continue;
      
      const offerStart = new Date(offer.requested_start);
      const offerEnd = new Date(offerStart.getTime() + offer.duration * 60_000);
      if (isOverlapping(start, end, offerStart, offerEnd)) {
        return false;
      }
    }
  }

  const { data: straddling } = await supabase
    .from('games')
    .select('id, duration, start_time, status')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .lt('start_time', start.toISOString());

  if (!straddling) return true;

  for (const game of straddling) {
    if ((game as any).status === 'Scheduled') {
      const { GRACE_PERIOD_MINUTES } = await import('@/lib/queue/reservation-policy');
      const graceEndMs = new Date(game.start_time).getTime() + (GRACE_PERIOD_MINUTES * 60000);
      if (graceEndMs <= start.getTime()) {
        continue; // It's past grace period, treat as no-show
      }
    }

    const gameEnd = new Date(
      new Date(game.start_time).getTime() + game.duration * 60_000
    );
    if (isOverlapping(start, end, new Date(game.start_time), gameEnd)) {
      return false;
    }
  }

  return true;
}

/**
 * Finds the latest possible cutoff time across all currently available courts.
 * Returns { courtId, cutoff } where cutoff is null if uncapped, or a Date if capped.
 * Returns undefined if no courts available.
 */
export async function getPlayNowCutoff(supabase: any, now: Date): Promise<{ courtId: string, courtName: string, cutoff: Date | null } | undefined> {

  const { data: courts } = await supabase
    .from('courts')
    .select('id, name, status');

  const eligibleCourts = (courts ?? []).filter((c: any) => c.status !== 'Maintenance' && c.status !== 'Closed');
  if (eligibleCourts.length === 0) return undefined; // No available courts right now

  let bestOption: { courtId: string, courtName: string, cutoff: Date | null } | undefined = undefined;

  for (const court of eligibleCourts) {
    const start = now;
    const end = new Date(start.getTime() + 60_000);
    const isFreeNow = await isSlotAvailable(court.id, start, end);
    
    if (!isFreeNow) continue; // Court is occupied

    const { data: nextGames } = await supabase
      .from('games')
      .select('start_time')
      .eq('court_id', court.id)
      .in('status', ['Scheduled'])
      .gt('start_time', start.toISOString())
      .order('start_time', { ascending: true })
      .limit(1);

    const nextGameStart = nextGames?.[0]?.start_time ? new Date(nextGames[0].start_time) : null;

    const { data: nextOffers } = await supabase
      .from('queue_entries')
      .select('requested_start')
      .eq('court_id', court.id)
      .in('status', ['offered'])
      .gt('requested_start', start.toISOString())
      .order('requested_start', { ascending: true })
      .limit(1);
    
    const nextOfferStart = nextOffers?.[0]?.requested_start ? new Date(nextOffers[0].requested_start) : null;

    let nextReservation: Date | null = null;
    if (nextGameStart && nextOfferStart) {
      nextReservation = nextGameStart < nextOfferStart ? nextGameStart : nextOfferStart;
    } else {
      nextReservation = nextGameStart || nextOfferStart;
    }

    if (nextReservation === null) {
      return { courtId: court.id, courtName: court.name, cutoff: null }; // Free forever, best option!
    }

    if (!bestOption || (bestOption.cutoff && nextReservation > bestOption.cutoff)) {
      bestOption = { courtId: court.id, courtName: court.name, cutoff: nextReservation };
    }
  }

  return bestOption;
}
