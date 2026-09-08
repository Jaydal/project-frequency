import { createAdminClient } from '@/lib/supabase/admin';
import { publishDisplay } from '@/lib/mqtt';
import { generatePayload, DisplaySequenceConfig } from '@/lib/display/sports-caster';
import { publishBoardOnce } from '@/lib/queue/board-publisher';
import { getBoardSnapshot, getBoardSnapshotSignature } from '@/lib/queue/board-snapshot';

let lastPublishedSignature: string | undefined;

export interface PublishAllResult {
  ok: boolean;
  failed: number;
  total: number;
}

export async function publishAllDisplays(): Promise<PublishAllResult> {
  let failed = 0;
  let total = 0;
  try {
    const supabase = createAdminClient();
    const snapshot = await getBoardSnapshot(supabase);
    const signature = getBoardSnapshotSignature(snapshot);
    if (lastPublishedSignature === signature) {
      return { ok: true, failed: 0, total: 0 };
    }

    const { data: settingsRows } = await supabase
      .from('settings')
      .select('key, value')
      .in('key', ['displaySequence']);
    
    let displaySequence: DisplaySequenceConfig | undefined;
    let brightness = 153;
    let rotation = 0;
    try {
      const v = settingsRows?.find(r => r.key === 'displaySequence')?.value;
      if (v) {
        const parsed = JSON.parse(v);
        displaySequence = parsed;
        brightness = parsed.brightness ?? 153;
        rotation = parsed.rotation ?? 0;
      }
    } catch {}

    for (const c of snapshot.courts) {
      let current = null;
      if (c.startTime > 0) {
        let name = c.matchTitle;
        if (!name && c.players?.length) {
          name = c.players.map(p => p.firstName).join(' & ') + ` - ${c.matchType}`;
        }
        if (!name) name = c.matchType;
        
        current = {
          name,
          startTime: new Date(c.startTime * 1000).toISOString(),
          durationMinutes: c.durationMin,
          matchTitle: c.matchTitle,
          matchType: c.matchType,
        };
      }

      const courtQueueCount = snapshot.queue.filter(q => !q.courtName || q.courtName === c.name).length;

      const upcoming = snapshot.upcomingGames
        .filter(g => g.id === c.id)
        .map(g => ({
          name: g.matchTitle,
          durationMinutes: g.durationMin,
          startTime: new Date(g.startTime * 1000).toISOString(),
        }));

      // Also append waitlist entries that are simulated to run on this court!
      snapshot.queue.filter(q => q.simulatedCourtId === c.id).forEach(q => {
        upcoming.push({
          name: q.matchTitle || (q.firstName + " " + q.lastName + " - " + q.matchType),
          durationMinutes: q.durationMin,
          startTime: new Date(q.estimatedStartTime * 1000).toISOString(),
        });
      });

      // Sort upcoming chronologically
      upcoming.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

      let nextName = '';
      let nextMatch = '';
      let nextWait = '';
      let nextBookedTime = '';

      if (upcoming.length > 0) {
        const next = upcoming[0];
        // For queue entries we have the full name stored as firstName + lastName in name, but let's just use it
        nextName = next.name;
        nextMatch = next.name; // or matchType if we had it separated
        
        // Format time in Asia/Manila timezone with \x01 superscript marker before AM/PM for LED matrix
        const formatTime = (isoString: string) => {
          const d = new Date(isoString);
          const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: 'Asia/Manila',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).formatToParts(d);
          const hour = parts.find(p => p.type === 'hour')?.value ?? '12';
          const minute = parts.find(p => p.type === 'minute')?.value ?? '00';
          const dayPeriod = (parts.find(p => p.type === 'dayPeriod')?.value ?? 'AM').toUpperCase();
          return `${hour}:${minute}\x01${dayPeriod}`; // \x01 = superscript marker
        };
        
        nextBookedTime = formatTime(next.startTime);
        
        const nowMs = Date.now();
        const startMs = new Date(next.startTime).getTime();
        const waitMins = Math.max(0, Math.floor((startMs - nowMs) / 60000));
        nextWait = waitMins <= 0 ? 'Now' : `~${waitMins} min`;
      }

      const payload = generatePayload(c.id, { current, upcoming }, {
        courtName: c.name,
        queueCount: courtQueueCount,
        displaySequence,
        nextName,
        nextMatch,
        nextWait,
        nextBookedTime,
        brightness,
        rotation,
      });

      total++;
      const ok = await publishDisplay(c.id, payload);
      if (!ok) {
        failed++;
        console.error(`[publish-all] Failed to publish display for court ${c.id}`);
      }
    }

    publishBoardOnce().catch(() => {});
    if (failed === 0) lastPublishedSignature = signature;
  } catch (err) {
    console.error('Failed to publish all displays:', err);
    failed++;
  }
  return { ok: failed === 0, failed, total };
}
