import type { SupabaseClient } from '@supabase/supabase-js';
import { getEstimatedWait } from './queue-service';


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
  matchType: string;
  matchTitle: string;
  startTime: number; // epoch seconds; 0 when not active
  durationMin: number;
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
  estimatedStartTime: number; // epoch seconds
  simulatedCourtId?: string;
  simulatedCourtName?: string;
  bookedAt: number; // epoch seconds
}

/* Pricing/durations config (from the `settings` table) so the kiosk doesn't
 * hardcode them. durations[i] pairs with rates[i]. */
export interface BoardConfig {
  durations: number[];
  rates: number[];
}

export interface BoardSnapshot {
  config: BoardConfig;
  courts: BoardCourt[];
  upcomingGames: BoardCourt[];
  nowServing: BoardNowServing;
  queue: BoardQueueRow[];
  serverTime: number;
}

/** Stable state used to decide whether an MQTT publication is necessary.
 * Wall-clock fields are intentionally excluded because clients advance timers
 * locally and must not be woken every second/minute. */
export function getBoardSnapshotSignature(snapshot: BoardSnapshot): string {
  return JSON.stringify({
    config: snapshot.config,
    courts: snapshot.courts,
    upcomingGames: snapshot.upcomingGames,
    nowServing: snapshot.nowServing,
    queue: snapshot.queue.map((q) => ({
      id: q.id,
      memberId: q.memberId,
      position: q.position,
      matchType: q.matchType,
      matchTitle: q.matchTitle,
      courtName: q.courtName,
      durationMin: q.durationMin,
      simulatedCourtId: q.simulatedCourtId,
      simulatedCourtName: q.simulatedCourtName,
      bookedAt: q.bookedAt,
    })),
  });
}

export function isGameActiveAt(game: { start_time?: string | null; duration?: number | null }, at = new Date()): boolean {
  if (!game.start_time || !game.duration) return false;
  const startMs = new Date(game.start_time).getTime();
  if (!Number.isFinite(startMs)) return false;
  const nowMs = at.getTime();
  return nowMs >= startMs && nowMs < startMs + game.duration * 60000;
}

export async function getBoardSnapshot(supabase: SupabaseClient): Promise<BoardSnapshot> {
  // W14: TODO - Replace `any` casts with generated Database types from Supabase CLI
  const [{ data: settingsRows }, { data: games }, { data: allCourts }, { data: waiting }, { data: offers }] =
    await Promise.all([
      supabase.from('settings').select('key, value').in('key', ['products', 'prices']),
      supabase
        .from('games')
        .select('id, court_id, match_type, match_title, duration, status, start_time, courts!inner(name), game_players(member_id, members!inner(first_name, last_name))')
        .in('status', ['In Progress', 'Scheduled'])
        .order('created_at', { ascending: true }),
      supabase.from('courts').select('*').order('name', { ascending: true }),
      /* `claimed` is an internal promotion lock. It must never appear in the
       * public queue because that player is already being assigned a game. */
      supabase.from('queue_entries').select('*').eq('status', 'waiting').order('created_at', { ascending: true }),
      supabase.from('queue_entries').select('*').eq('status', 'offered').order('expires_at', { ascending: true }),
    ]);

  const settings = new Map<string, string>((settingsRows ?? []).map((r: any) => [r.key, r.value]));
  const tryParse = (v: string | undefined): any => { try { return v ? JSON.parse(v) : undefined; } catch { return undefined; } };
  const durations: number[] = tryParse(settings.get('products'))?.durations ?? [30, 60, 90];
  const priceMap: Record<string, number> = tryParse(settings.get('prices')) ?? { '30': 150, '60': 300, '90': 450 };
  const config: BoardConfig = {
    durations,
    rates: durations.map((d) => priceMap[String(d)] ?? 0),
  };

  const gamesByCourt = new Map<string, any[]>();
  (games ?? []).forEach((g: any) => {
    if (!gamesByCourt.has(g.court_id)) gamesByCourt.set(g.court_id, []);
    gamesByCourt.get(g.court_id)!.push(g);
  });

  /* A queue row can briefly remain `waiting` if a promotion was interrupted
   * after the game was created. Never publish a member in both places: active
   * game membership is authoritative for the kiosk/web board. */
  const activeMemberIds = new Set<string>();
  (games ?? []).forEach((g: any) => {
    if (!isGameActiveAt(g)) return;
    (g.game_players ?? []).forEach((gp: any) => {
      if (gp.member_id) activeMemberIds.add(gp.member_id);
    });
  });
  if (waiting && activeMemberIds.size > 0) {
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (activeMemberIds.has(waiting[i].member_id)) waiting.splice(i, 1);
    }
  }

  const courts: BoardCourt[] = (allCourts ?? []).map((c: any) => {
    const courtGames = gamesByCourt.get(c.id) || [];
    let activeGame = null;

    courtGames.sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
      const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
      return ta - tb;
    });

    for (const game of courtGames) {
      if (game.start_time) {
        const startMs = new Date(game.start_time).getTime();
        if (isGameActiveAt(game)) {
          activeGame = game;
          break;
        }
      }
    }

    if (activeGame && activeGame.start_time) {
      const startMs = new Date(activeGame.start_time).getTime();
      return {
        id: c.id,
        name: c.name,
        matchType: activeGame.match_type ?? '',
        matchTitle: activeGame.match_title ?? '',
        startTime: Math.floor(startMs / 1000),
        durationMin: activeGame.duration ?? 0,
        players: (activeGame.game_players ?? []).map((gp: any) => ({
          firstName: gp.members?.first_name ?? '',
          lastName: gp.members?.last_name ? gp.members.last_name.charAt(0) : '',
        })),
      };
    }
    return {
      id: c.id, name: c.name, matchType: '', matchTitle: '',
      startTime: 0, durationMin: 0,  players: [],
    };
  });

  const upcomingGames: BoardCourt[] = [];
  courts.forEach(c => {
    const courtGames = gamesByCourt.get(c.id) || [];
    for (const game of courtGames) {
      if (game.start_time) {
        const startMs = new Date(game.start_time).getTime();
        const endMs = startMs + (game.duration ?? 0) * 60000;
        if (Date.now() < endMs) {
          if (c.startTime === Math.floor(startMs / 1000)) continue;
          
          upcomingGames.push({
            id: c.id,
            name: c.name,
            matchType: game.match_type ?? '',
            matchTitle: game.match_title ?? '',
            startTime: Math.floor(startMs / 1000),
            durationMin: game.duration ?? 0,
            players: (game.game_players ?? []).map((gp: any) => ({
              firstName: gp.members?.first_name ?? '',
              lastName: gp.members?.last_name ? gp.members.last_name.charAt(0) : '',
            })),
          });
        }
      }
    }
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

  const serverTime = Math.floor(Date.now() / 1000);

  // Initialize court free times for simulation
  const courtFreeTimes = courts.map(c => {
    if (c.startTime > 0) {
      return { id: c.id, name: c.name, time: c.startTime + (c.durationMin * 60) };
    }
    return { id: c.id, name: c.name, time: serverTime };
  });

  const queue: BoardQueueRow[] = (waiting ?? []).map((q: any, i: number) => {
    // Sort ascending so courtFreeTimes[0] is the earliest available court
    courtFreeTimes.sort((a, b) => a.time - b.time);
    
    // If the entry requires a specific court, find it
    let targetCourtIdx = 0;
    if (q.court_id) {
      const idx = courtFreeTimes.findIndex(c => c.id === q.court_id);
      if (idx !== -1) targetCourtIdx = idx;
    }

    const targetCourt = courtFreeTimes[targetCourtIdx];
    let estStart = targetCourt.time;
    // If the earliest court is in the past, they start now
    if (estStart < serverTime) estStart = serverTime;

    // Simulate this queue entry taking that court
    const duration = q.duration ?? 30; // fallback to 30 mins
    targetCourt.time = estStart + (duration * 60);

    return {
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
      estimatedStartTime: estStart,
      simulatedCourtId: targetCourt.id,
      simulatedCourtName: targetCourt.name,
      bookedAt: q.created_at ? Math.floor(new Date(q.created_at).getTime() / 1000) : serverTime,
    };
  });

  /* Confirmed future games are part of the public schedule. Include them in
   * the same list after live waiters so the web and kiosk queue panels show a
   * complete, time-aware lineup. Active and lapsed games are excluded by the
   * upcomingGames construction above. */
  const scheduledRows: BoardQueueRow[] = upcomingGames
    .filter((g) => g.startTime > serverTime)
    .sort((a, b) => a.startTime - b.startTime)
    .map((g, index) => ({
      id: `scheduled-${g.id}-${g.startTime}`,
      memberId: g.players[0] ? `${g.players[0].firstName}-${g.players[0].lastName}` : '',
      position: queue.length + index + 1,
      firstName: g.players[0]?.firstName ?? 'Reserved',
      lastName: g.players[0]?.lastName ?? '',
      matchType: g.matchType,
      matchTitle: g.matchTitle,
      courtName: g.name,
      durationMin: g.durationMin,
      estimatedWait: 'Scheduled',
      estimatedStartTime: g.startTime,
      simulatedCourtId: g.id,
      simulatedCourtName: g.name,
      bookedAt: g.startTime,
    }));
  queue.push(...scheduledRows);
  // effectivePrepSec is applied per-court on the client using durationMin; we
  // pass the raw configured prepTimeSec so the kiosk applies the same rule.

  return { config, courts, upcomingGames, nowServing, queue, serverTime };
}
