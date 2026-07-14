import { NextResponse } from 'next/server';
import { getViewerCounts } from '@/lib/display-viewers';

type Viewer = { courtId: string; seenAt: number };
const g = global as typeof globalThis & { _displayViewers?: Map<string, Viewer> };
if (!g._displayViewers) g._displayViewers = new Map();

export async function POST(request: Request) {
  const { viewerId, courtId } = await request.json();
  if (!viewerId || !courtId) {
    return NextResponse.json({ error: 'viewerId and courtId required' }, { status: 400 });
  }
  g._displayViewers!.set(viewerId, { courtId, seenAt: Date.now() });
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json(getViewerCounts());
}
