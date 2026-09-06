import type { CourtStatusData } from './CourtStatusCard';
import type { BoardCourt } from '@/lib/queue/board-snapshot';

type CourtRef = Pick<BoardCourt, 'id' | 'name'>;

export function buildCourtDisplays(
  courts: CourtRef[],
  upcomingGames: BoardCourt[],
  nowSec: number,
): CourtStatusData[] {
  return courts.map((court) => {
    const scheduled = upcomingGames
      .filter((game) =>
        game.id === court.id && game.startTime + game.durationMin * 60 > nowSec
      )
      .sort((a, b) => a.startTime - b.startTime)[0];

    if (!scheduled) {
      return {
        id: court.id,
        name: court.name,
        status: 'Available',
        players: [],
      };
    }

    return {
      id: court.id,
      name: court.name,
      status: 'Scheduled',
      matchType: scheduled.matchType,
      matchTitle: scheduled.matchTitle,
      duration: scheduled.durationMin,
      elapsed: 0,
      start_time: new Date(scheduled.startTime * 1000).toISOString(),
      players: scheduled.players.map((p) => ({ first_name: p.firstName, last_name: p.lastName })),
    };
  });
}
