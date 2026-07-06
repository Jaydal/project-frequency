import { NextResponse } from 'next/server';
import { getControllerUrl } from '@/lib/esp32';
import { z } from 'zod';

export async function GET() {
  const url = await getControllerUrl();
  if (!url) return NextResponse.json({ error: 'Controller offline' }, { status: 503 });
  try {
    const res = await fetch(`${url}/display`, { signal: AbortSignal.timeout(3000) });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: 'Controller unreachable' }, { status: 503 });
  }
}

const schema = z.object({
  lines: z.tuple([z.string().max(20), z.string().max(20), z.string().max(20)]),
});

export async function POST(request: Request) {
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const url = await getControllerUrl();
  if (!url) return NextResponse.json({ error: 'Controller offline' }, { status: 503 });
  try {
    const res = await fetch(`${url}/display`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result.data),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) throw new Error();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Controller unreachable' }, { status: 503 });
  }
}
