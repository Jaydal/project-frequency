import { DisplayPayload, DisplayPage } from '../mqtt';

export interface ScheduleData {
  maintenance?: boolean;
  current?: {
    name: string;
    startTime: string;
    durationMinutes: number;
  } | null;
  upcoming: { name: string }[];
}

export function generatePayload(courtId: string, schedule: ScheduleData): DisplayPayload {
  const pages: DisplayPage[] = [];
  let state: 'OPEN' | 'PLAYING' | 'MAINTENANCE' = 'OPEN';

  const courtNumStr = courtId.startsWith('court-') ? courtId.replace('court-', '').toUpperCase() : courtId.slice(-4).toUpperCase();

  if (schedule.maintenance) {
    state = 'MAINTENANCE';
    pages.push({
      text: `COURT ${courtNumStr} CLOSED FOR MAINTENANCE`,
      color: "#FF0000",
      effect: "SCROLL",
      durationSeconds: 10
    });
  } else if (!schedule.current) {
    state = 'OPEN';
    pages.push({
      text: `COURT ${courtNumStr} AVAILABLE`,
      color: "#00FF00",
      effect: "SCROLL",
      durationSeconds: 10
    });
    pages.push({
      text: "SCAN KIOSK TO PLAY",
      color: "#FFFFFF",
      effect: "SCROLL",
      durationSeconds: 5
    });
  } else {
    state = 'PLAYING';
    pages.push({
      text: `PLAYING: ${schedule.current.name}`,
      color: "#00FFFF", // CYAN
      effect: "SCROLL",
      durationSeconds: 10
    });

    if (schedule.upcoming.length === 0) {
      pages.push({
        text: "COURT OPEN AFTER THIS GAME",
        color: "#00FF00",
        effect: "SCROLL",
        durationSeconds: 5
      });
    } else {
      schedule.upcoming.forEach((game, index) => {
        if (index === 0) {
          pages.push({
            text: `UP NEXT: ${game.name}`,
            color: "#FFFF00", // YELLOW
            effect: "SCROLL",
            durationSeconds: 8
          });
        } else if (index === 1) {
          pages.push({
            text: `2ND IN LINE: ${game.name}`,
            color: "#FFA500", // ORANGE
            effect: "SCROLL",
            durationSeconds: 5
          });
        }
      });
    }
  }

  const mappedSchedule = {
    current: schedule.current
      ? {
          name: schedule.current.name,
          startTime: schedule.current.startTime,
          startTimeEpoch: (() => {
            const t = Math.floor(new Date(schedule.current.startTime).getTime() / 1000);
            return isNaN(t) ? Math.floor(Date.now() / 1000) : t;
          })(),
          durationMinutes: schedule.current.durationMinutes,
        }
      : null,
    upcoming: schedule.upcoming,
  };

  return {
    courtId,
    action: 'QUEUE_UPDATE',
    state,
    schedule: mappedSchedule,
    display: {
      pages
    }
  };
}
