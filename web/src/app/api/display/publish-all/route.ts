import { NextResponse } from 'next/server';
import { publishAllDisplays } from '@/lib/display/publish-all';
import { requireStaffOrController } from '@/lib/auth/server-guards';

async function publishAll(request: Request) {
  const auth = await requireStaffOrController(request);
  if (auth.response) return auth.response;
  const res = await publishAllDisplays();
  if (!res.ok) {
    return NextResponse.json(
      { error: `Publish failed (${res.failed}/${res.total})`, failed: res.failed, total: res.total },
      { status: 500 },
    );
  }
  return NextResponse.json({ success: true, ...res });
}

export async function GET(request: Request) {
  return publishAll(request);
}

export async function POST(request: Request) {
  return publishAll(request);
}
