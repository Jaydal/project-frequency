import { NextResponse } from 'next/server';
import { z } from 'zod';
import { publishDisplay } from '@/lib/mqtt';

const schema = z.object({
  courtId: z.string().min(1),
  line1:   z.string().max(20).default(''),
  line2:   z.string().max(20).default(''),
  line3:   z.string().max(20).default(''),
});

export async function POST(request: Request) {

  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const { courtId, line1, line2, line3 } = result.data;
  const ok = await publishDisplay(courtId, { line1, line2, line3 });
  return NextResponse.json({ ok }, { status: ok ? 200 : 503 });
}
