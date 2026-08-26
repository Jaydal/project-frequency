import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const courtId = searchParams.get('courtId');
  const date = searchParams.get('date');
  if (!courtId || !date) return NextResponse.json({ error: 'courtId and date required' }, { status: 400 });

  const supabase = await createClient();
  const dayStart = new Date(date + 'T00:00:00Z');
  const dayEnd = new Date(date + 'T23:59:59Z');

  const { data: games } = await supabase
    .from('games')
    .select('start_time, duration, status')
    .eq('court_id', courtId)
    .in('status', ['Scheduled', 'In Progress'])
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString());

  const slots: { time: string; available: boolean }[] = [];
  for (let h = 8; h < 22; h++) {
    for (let m = 0; m < 60; m += 30) {
      const timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      const slotStart = new Date(`${date}T${timeStr}:00Z`);
      const slotEnd = new Date(slotStart.getTime() + 30 * 60_000);
      const busy = (games ?? []).some((g: any) => {
        const gStart = new Date(g.start_time);
        const gEnd = new Date(gStart.getTime() + g.duration * 60_000);
        return slotStart < gEnd && slotEnd > gStart;
      });
      slots.push({ time: timeStr, available: !busy });
    }
  }

  return NextResponse.json({ courtId, date, slots });
}
