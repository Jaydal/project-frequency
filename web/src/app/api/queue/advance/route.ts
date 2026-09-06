import { NextResponse } from 'next/server';
import { processAllCourts } from '@/lib/queue/queue-processor';
import { publishAllDisplays } from '@/lib/display/publish-all';
import { checkControllerKey } from '@/lib/controller-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';

async function advance(request: Request) {
  const device = await authenticateControllerDevice(request, 'kiosk');
  if (!device && !checkControllerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const started = Date.now();
  await processAllCourts();
  const res = await publishAllDisplays();
  return NextResponse.json({
    ok: res.ok,
    total: res.total,
    failed: res.failed,
    elapsedMs: Date.now() - started,
  });
}

export async function GET(request: Request) {
  return advance(request);
}

export async function POST(request: Request) {
  return advance(request);
}
