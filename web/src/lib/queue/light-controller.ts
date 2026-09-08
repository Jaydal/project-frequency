import { createClient } from '@/lib/supabase/server';
import { publishLightsCommand } from '@/lib/mqtt';

type LightState = 'OFF' | 'ON' | 'WAITING';

const g = globalThis as typeof globalThis & {
  _lightState?: LightState;
  _lightWaitTimer?: ReturnType<typeof setTimeout> | null;
  _lightLastPublish?: 'ON' | 'OFF' | null;
};

if (!g._lightState) g._lightState = 'OFF';
if (!g._lightWaitTimer) g._lightWaitTimer = null;
if (!g._lightLastPublish) g._lightLastPublish = null;

const SUNSET_HOUR = parseInt(process.env.LIGHT_SUNSET_HOUR ?? '18', 10);
const WAIT_MINUTES = parseInt(process.env.LIGHT_WAIT_MINUTES ?? '10', 10);

function isEvening(): boolean {
  // Venue is in Asia/Manila (UTC+8)
  const hourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    hour12: false,
  }).format(new Date());
  const hour = parseInt(hourStr, 10);
  return hour >= SUNSET_HOUR;
}

async function sendCommand(state: 'ON' | 'OFF'): Promise<void> {
  if (g._lightLastPublish === state) return;
  g._lightLastPublish = state;
  await publishLightsCommand(state);
}

function clearWaitTimer(): void {
  if (g._lightWaitTimer) {
    clearTimeout(g._lightWaitTimer);
    g._lightWaitTimer = null;
  }
}

export async function evaluateLights(): Promise<void> {
  const supabase = await createClient();

  const { data: courts } = await supabase
    .from('courts')
    .select('status');

  const hasActiveGame = courts?.some(c => c.status === 'In Game') ?? false;

  switch (g._lightState) {
    case 'OFF':
      if (hasActiveGame && isEvening()) {
        await sendCommand('ON');
        g._lightState = 'ON';
      }
      break;

    case 'ON':
      if (!hasActiveGame) {
        g._lightState = 'WAITING';
        clearWaitTimer();
        g._lightWaitTimer = setTimeout(async () => {
          await sendCommand('OFF');
          g._lightState = 'OFF';
          g._lightWaitTimer = null;
        }, WAIT_MINUTES * 60 * 1000);
      }
      break;

    case 'WAITING':
      if (hasActiveGame) {
        clearWaitTimer();
        g._lightState = 'ON';
      }
      break;
  }
}
