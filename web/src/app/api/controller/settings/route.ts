import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkControllerKey } from '@/lib/controller-auth';
import { authenticateControllerDevice } from '@/lib/controller-device-auth';

export async function GET(request: Request) {
  const device = await authenticateControllerDevice(request);
  // Legacy API-key authentication is retained temporarily for already
  // deployed devices while the allowlist is populated.
  if (!device && !checkControllerKey(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const supabase = createAdminClient();
  const { data: rows } = await supabase.from('settings').select('key, value');

  const map = Object.fromEntries((rows ?? []).map((r: any) => [r.key, r.value]));

  return NextResponse.json({
    operatingHours:  map['operatingHours']  ?? '06:00-22:00',
    prices:          map['prices']          ?? '{"15":100,"30":150,"60":300,"90":450}',
    preparationTime: map['preparationTime'] ?? '120',
    cooldownTime:    map['cooldownTime']    ?? '60',
    nightMode:       map['nightMode']       ?? '18:00',
    bellDuration:    map['bellDuration']    ?? '3',
  });
}
