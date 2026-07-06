import { NextResponse } from 'next/server';
import { publishDisplay } from '@/lib/mqtt';
import { z } from 'zod';

const schema = z.object({
  courtId: z.string(),
  line1: z.string().max(16).default(''),
  line2: z.string().max(16).default(''),
  line3: z.string().max(16).default(''),
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid payload', details: result.error.flatten() }, { status: 400 });
  }

  const ok = await publishDisplay(result.data.courtId, {
    line1: result.data.line1,
    line2: result.data.line2,
    line3: result.data.line3,
  });

  return NextResponse.json({ published: ok });
}
