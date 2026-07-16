import type { SupabaseClient } from '@supabase/supabase-js';
import { getEstimatedWait } from './queue-service';
import { effectivePrepSec } from '@/lib/products-config-types';

/* Server-side equivalent of the client QueueBoard's fetched state, in a flat
 * shape that maps 1:1 to the kiosk firmware's kiosk_board_t. Published to MQTT
 * (topic `freq/board`) so the ESP32 kiosk can render the live board without a
 * Supabase Realtime connection. Timestamps are epoch SECONDS (not ms/ISO) so
 * the C client can hold them in a time_t directly.
 *
 * Court `startTime` (not a frozen elapsed) is emitted so the kiosk advances its
 * own timers locally between board pushes — the publisher only needs to fire on
 * state changes / a slow cadence, not once per second. */

export interface BoardCourt {
  id: string;
  name: string;
  active: boolean;
  matchType: string;
  matchTitle: string;
  startTime: number; // epoch seconds; 0 when not active
  durationMin: number;
  prepTimeSec: number;
  players: { firstName: string; lastName: string }[];
}

export interface BoardNowServing {
  hasOffer: boolean;
  queueEntryId: string; // queue entry UUID
  memberId: string; // member UUID
  playerFirstName: string;
  courtName: string;
  durationMin: number;
  expiresAt: number; // epoch seconds
}

export interface BoardQueueRow {
  id: string; // queue entry UUID
  memberId: string; // member UUID
  position: number;
  firstName: string;
  lastName: string;
  matchType: string;
  matchTitle: string;
  courtName: string;
  durationMin: number;
  estimatedWait: string;
}

/* Pricing/durations config (from the `settings` table) so the kiosk doesn't
 * hardcode them. durations[i] pairs with rates[i]. */
export interface BoardConfig {
  durations: number[];
  rates: number[];
  prepTimeSec: number;
}

export interface BoardSnapshot {
  config: BoardConfig;
  courts: BoardCourt[];
  nowServing: BoardNowServing;
  queue: BoardQueueRow[];
}

export async function getBoardSnapshot(supabase: SupabaseClient): Promise<BoardSnapshot> {
  // W14: TODO - Replace `any` casts with generated Database types from Supabase CLI
  const [{ data: settingsRows }, { data: games }, { data: allCourts }, { data: waiting }, { data: offers }] =
    await Promise.all([
      supabase.from('settings').select('key, value').in('key', ['products', 'prices', 'preparationTime']),
      supabase
        .from('games')
        .select('id, court_id, match_type, match_title, duration, status, start_time, courts!inner(name), game_players(member_id, members!inner(first_name, last_name))')
        .in('status', ['In Progress', 'Scheduled'])
        .order('created_at', { ascending: true }),
      supabase.from('courts').select('*').order('name', { ascending: true }),
      supabase.from('queue_entries').select('*').eq('status', 'waiting').order('created_at', { ascending: true }),
      supabase.from('queue_entries').select('*').eq('status', 'offered').order('expires_at', { ascending: true }),
    ]);

  const settings = new Map<string, string>((settingsRows ?? []).map((r: any) => [r.key, r.value]));
  const tryParse = (v: string | undefined): any => { try { return v ? JSON.parse(v) : undefined; } catch { return undefined; } };
  const prepTimeSec = parseInt(settings.get('preparationTime') ?? '', 10) || 300;
  const durations: number[] = tryParse(settings.get('products'))?.durations ?? [30, 60, 90];
  const priceMap: Record<string, number> = tryParse(settings.get('prices')) ?? { '30': 150, '60': 300, '90': 450 };
  const config: BoardConfig = {
    durations,
    rates: durations.map((d) => priceMap[String(d)] ?? 0),
    prepTimeSec,
  };

  const gameByCourt = new Map<string, any>();
  (games ?? []).forEach((g: any) => { if (!gameByCourt.has(g.court_id)) gameByCourt.set(g.court_id, g); });

  const courts: BoardCourt[] = (allCourts ?? []).map((c: any) => {
    const game = gameByCourt.get(c.id);
    if (game && game.start_time) {
      return {
        id: c.id,
        name: c.name,
        active: true,
        matchType: game.match_type ?? '',
        matchTitle: game.match_title ?? '',
        startTime: Math.floor(new Date(game.start_time).getTime() / 1000),
        durationMin: game.duration ?? 0,
        prepTimeSec,
        players: (game.game_players ?? []).map((gp: any) => ({
          firstName: gp.members?.first_name ?? '',
          // W9: Truncate last name to initial only for privacy on public MQTT
          lastName: gp.members?.last_name ? gp.members.last_name.charAt(0) : '',
        })),
      };
    }
    return {
      id: c.id, name: c.name, active: false, matchType: '', matchTitle: '',
      startTime: 0, durationMin: 0, prepTimeSec, players: [],
    };
  });

  // Collect member names for waiting entries and the prioritized offer.
  const memberIds = new Set<string>();
  (waiting ?? []).forEach((q: any) => memberIds.add(q.member_id));
  const prioritizedOffer = (offers ?? []).length > 0 ? (offers as any[])[0] : null; // ordered by expires_at asc
  if (prioritizedOffer) memberIds.add(prioritizedOffer.member_id);

  const nameById = new Map<string, { first: string; last: string }>();
  if (memberIds.size > 0) {
    const { data: members } = await supabase
      .from('members')
      .select('id, first_name, last_name')
      .in('id', [...memberIds]);
    (members ?? []).forEach((m: any) => nameById.set(m.id, { first: m.first_name, last: m.last_name }));
  }

  const courtNameById = new Map<string, string>((allCourts ?? []).map((c: any) => [c.id, c.name]));

  const nowServing: BoardNowServing = prioritizedOffer
    ? {
        hasOffer: true,
        queueEntryId: prioritizedOffer.id,
        memberId: prioritizedOffer.member_id,
        playerFirstName: nameById.get(prioritizedOffer.member_id)?.first ?? 'Player',
        courtName: prioritizedOffer.court_id ? (courtNameById.get(prioritizedOffer.court_id) ?? 'Court') : 'Court',
        durationMin: prioritizedOffer.duration ?? 0,
        expiresAt: prioritizedOffer.expires_at ? Math.floor(new Date(prioritizedOffer.expires_at).getTime() / 1000) : 0,
      }
    : { hasOffer: false, queueEntryId: '', memberId: '', playerFirstName: '', courtName: '', durationMin: 0, expiresAt: 0 };

  const queue: BoardQueueRow[] = (waiting ?? []).map((q: any, i: number) => ({
    id: q.id,
    memberId: q.member_id,
    position: i + 1,
    firstName: nameById.get(q.member_id)?.first ?? '?',
    // W9: Truncate last name to initial only
    lastName: nameById.get(q.member_id)?.last ? nameById.get(q.member_id)!.last.charAt(0) : '',
    matchType: q.party_size === 4 ? '2v2' : '1v1',
    matchTitle: q.match_title ?? '',
    courtName: q.court_id ? (courtNameById.get(q.court_id) ?? '') : '',
    durationMin: q.duration ?? 0,
    estimatedWait: getEstimatedWait(i + 1),
  }));

  // effectivePrepSec is applied per-court on the client using durationMin; we
  // pass the raw configured prepTimeSec so the kiosk applies the same rule.

  return { config, courts, nowServing, queue };
}
