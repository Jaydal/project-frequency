import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { checkControllerKey } from '@/lib/controller-auth';

const schema = z.object({
  status: z.string(),
  firmwareVersion: z.string(),
  ipAddress: z.string(),
  temperature: z.number().optional(),
});

export async function POST(request: Request) {
  if (!checkControllerKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  const result = schema.safeParse(body);
  if (!result.success) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });

  const supabase = await createClient();
  const { error } = await supabase.from('controller_logs').insert({
    status: result.data.status,
    firmware_version: result.data.firmwareVersion,
    ip_address: result.data.ipAddress,
    temperature: result.data.temperature ?? null,
    last_sync: new Date().toISOString(),
  });

  if (error) return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  return NextResponse.json({ success: true });
}
