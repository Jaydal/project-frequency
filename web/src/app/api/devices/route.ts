import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/server-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const DEVICE_ID_PATTERN = /^(?:[0-9a-f]{12}|simulator)$/;

function normalizeDeviceId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[:-]/g, '');
}

const registerDeviceSchema = z.object({
  deviceId: z.string().min(1),
  deviceType: z.enum(['kiosk', 'display']),
  courtId: z.string().nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

export async function GET() {
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  const admin = createAdminClient();
  const [{ data: devices, error: devError }, { data: courts, error: courtError }] = await Promise.all([
    admin
      .from('controller_devices')
      .select('device_id, device_type, court_id, enabled, last_seen_at, created_at, courts(name)')
      .order('created_at', { ascending: false }),
    admin
      .from('courts')
      .select('id, name')
      .order('name'),
  ]);

  if (devError) {
    return NextResponse.json({ error: devError.message }, { status: 500 });
  }

  const mapped = (devices ?? []).map((d: any) => ({
    deviceId: d.device_id,
    deviceType: d.device_type,
    courtId: d.court_id,
    courtName: d.courts?.name ?? null,
    enabled: d.enabled,
    lastSeenAt: d.last_seen_at,
    createdAt: d.created_at,
  }));

  return NextResponse.json({
    devices: mapped,
    courts: (courts ?? []).map((c: any) => ({ id: c.id, name: c.name })),
  });
}

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = registerDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid device parameters', details: parsed.error.flatten() }, { status: 400 });
  }

  const normalizedId = normalizeDeviceId(parsed.data.deviceId);
  if (!DEVICE_ID_PATTERN.test(normalizedId)) {
    return NextResponse.json({
      error: 'Invalid Device ID. Must be a 12-character MAC address (e.g. 24:4C:AB:12:34:56) or "simulator".',
    }, { status: 400 });
  }

  if (normalizedId === 'simulator' && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Simulator device ID cannot be registered in production environment.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // If courtId is provided, verify it exists
  if (parsed.data.courtId) {
    const { data: court } = await admin
      .from('courts')
      .select('id')
      .eq('id', parsed.data.courtId)
      .maybeSingle();

    if (!court) {
      return NextResponse.json({ error: 'Assigned court does not exist' }, { status: 400 });
    }
  }

  const { data: inserted, error } = await admin
    .from('controller_devices')
    .insert({
      device_id: normalizedId,
      device_type: parsed.data.deviceType,
      court_id: parsed.data.courtId || null,
      enabled: parsed.data.enabled,
    })
    .select('device_id, device_type, court_id, enabled, created_at, courts(name)')
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Device ${normalizedId} is already registered.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    device: {
      deviceId: inserted.device_id,
      deviceType: inserted.device_type,
      courtId: inserted.court_id,
      courtName: (inserted as any).courts?.name ?? null,
      enabled: inserted.enabled,
      createdAt: inserted.created_at,
    },
  }, { status: 201 });
}
