import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { publishDisplay } from '@/lib/mqtt';
import { effectivePrepSec } from '@/lib/products-config-types';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fill(template: string, vars: Record<string, string>): string {
  let s = template;
  for (const [k, v] of Object.entries(vars)) {
    s = s.replaceAll(`{${k}}`, v);
  }
  return s.toUpperCase().slice(0, 32);
}

const DEFAULT_SEQUENCE = {
  idle: {
    interval: 10,
    pages: [
      { line1: '{court_name}', line2: 'COURT AVAILABLE', line3: 'WELCOME' },
      { line1: '{court_name}', line2: '{queue_count} IN QUEUE', line3: 'BOOK AT TERMINAL' },
    ],
  },
  prep: {
    interval: 10,
    pages: [
      { line1: '{court_name}', line2: '{match_info}', line3: 'GAME {timer}' },
      { line1: '{court_name}', line2: 'GET READY', line3: '{queue_count} WAITING' },
    ],
  },
  game: {
    interval: 10,
    pages: [
      { line1: '{court_name}', line2: '{match_info}', line3: '{timer} LEFT' },
      { line1: '{court_name}', line2: '{match_info}', line3: '{queue_count} IN QUEUE' },
    ],
  },
};

export async function POST() {
  const supabase = await createClient();
  const now = Date.now();

  let sequenceRaw: string | null = null;
  let prepRaw: string | null = null;
  try {
    const { data: sr } = await supabase.from('settings').select('value').eq('key', 'displaySequence').single();
    if (sr) sequenceRaw = sr.value;
  } catch {}
  try {
    const { data: pr } = await supabase.from('settings').select('value').eq('key', 'preparationTime').single();
    if (pr) prepRaw = pr.value;
  } catch {}

  const rawPrep = parseInt(prepRaw ?? '300', 10);
  const prepSec = isNaN(rawPrep) ? 300 : rawPrep;

  let sequence: any = DEFAULT_SEQUENCE;
  if (sequenceRaw) {
    try { sequence = JSON.parse(sequenceRaw); } catch {}
  }

  const { data: courts } = await supabase.from('courts').select('*').order('name');
  const { data: games } = await supabase.from('games').select('*, courts!inner(name)').in('status', ['In Progress', 'Scheduled']).order('start_time', { ascending: false });
  const { count: qCount } = await supabase.from('queue_entries').select('*', { count: 'exact', head: true }).eq('status', 'waiting');
  const queueTotal = qCount ?? 0;
  const gameByCourt = new Map<string, any>();
  (games ?? []).forEach((g: any) => gameByCourt.set(g.court_id, g));

  for (const court of courts ?? []) {
    const game = gameByCourt.get(court.id);
    const queueLine = queueTotal ? `${queueTotal}` : '0';
    const vars: Record<string, string> = {
      court_name: court.name,
      match_info: game?.match_title || game?.match_type || '',
      queue_count: queueLine,
      timer: '',
    };

    if (game && game.start_time) {
      const elapsed = Math.floor((now - new Date(game.start_time).getTime()) / 1000);
      const effPrep = effectivePrepSec(game.duration, prepSec);
      const totalSec = game.duration * 60 + effPrep;
      const stateKey = elapsed < effPrep ? 'prep' : elapsed < totalSec ? 'game' : 'idle';
      const remain = stateKey === 'prep' ? effPrep - elapsed : stateKey === 'game' ? totalSec - elapsed : 0;

      vars.timer = fmt(remain);
      vars.match_info = game.match_title || game.match_type || 'MATCH';

      const config = sequence[stateKey] || sequence.idle;
      const interval = (config.interval ?? 10) * 1000;
      const pageIdx = Math.floor(elapsed / interval) % (config.pages?.length ?? 1);
      const page = config.pages?.[pageIdx] ?? { line1: '{court_name}', line2: '{match_info}', line3: '{timer}' };

      await publishDisplay(court.id, {
        line1: fill(page.line1, vars),
        line2: fill(page.line2, vars),
        line3: fill(page.line3, vars),
      });
    } else {
      vars.timer = '';
      vars.match_info = '';

      const config = sequence.idle;
      const interval = (config.interval ?? 10) * 1000;
      const stateStart = court.last_activity ? new Date(court.last_activity).getTime() : now;
      const elapsed = Math.floor((now - stateStart) / 1000);
      const pageIdx = Math.floor(elapsed / interval) % (config.pages?.length ?? 1);
      const page = config.pages?.[pageIdx] ?? { line1: '{court_name}', line2: 'COURT AVAILABLE', line3: 'WELCOME' };

      await publishDisplay(court.id, {
        line1: fill(page.line1, vars),
        line2: fill(page.line2, vars),
        line3: fill(page.line3, vars),
      });
    }
  }

  return NextResponse.json({ ok: true, courts: courts?.length ?? 0 });
}
