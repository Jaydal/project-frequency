import { NextResponse } from 'next/server';
import { getControllerUrl } from '@/lib/esp32';
import { z } from 'zod';

const schema = z.object({ text: z.string().max(20) });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ row: string }> }
) {
  const { row } = await params;
  const rowNum = parseInt(row);
  if (isNaN(rowNum) || rowNum < 0 || rowNum > 2)
    return NextResponse.json({ error: 'Invalid row' }, { status: 400 });

  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const url = await getControllerUrl();
  if (!url) return NextResponse.json({ error: 'Controller offline' }, { status: 503 });
  try {
    const res = await fetch(`${url}/display/${rowNum}`, {
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
