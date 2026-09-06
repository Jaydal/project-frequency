import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';
import { checkControllerKey } from '@/lib/controller-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';

const schema = z.object({
  status: z.string(),
  firmwareVersion: z.string(),
  ipAddress: z.string(),
  temperature: z.number().optional(),
});

export async function POST(request: Request) {
  const device = await authenticateControllerDevice(request);
  // Legacy API-key authentication is retained temporarily for already
  // deployed devices while the allowlist is populated.
  if (!device && !checkControllerKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const supabase = createAdminClient();
  const { error } = await supabase.from('controller_logs').insert({
    status: result.data.status,
    firmware_version: result.data.firmwareVersion,
    ip_address: result.data.ipAddress,
    temperature: result.data.temperature ?? null,
    last_sync: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });

  // Fire background cleanup & publish without blocking the response
  const publishUrl = new URL('/api/display/publish-all', request.url).toString();
  fetch(publishUrl, {
    method: 'POST',
    headers: { 'x-api-key': request.headers.get('x-api-key') ?? '' },
  }).catch(console.error);

  return NextResponse.json({ success: true });
}
