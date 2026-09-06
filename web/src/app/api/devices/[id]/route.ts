import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/server-guards';
import { createAdminClient } from '@/lib/supabase/admin';
import { z } from 'zod';

const updateDeviceSchema = z.object({
  enabled: z.boolean().optional(),
  courtId: z.string().nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  const { id } = await params;
  const normalizedId = id.trim().toLowerCase().replace(/[:-]/g, '');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = updateDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid update parameters', details: parsed.error.flatten() }, { status: 400 });
  }

  const admin = createAdminClient();

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

  const updates: Record<string, unknown> = {};
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled;
  if (parsed.data.courtId !== undefined) updates.court_id = parsed.data.courtId;

  const { data: updated, error } = await admin
    .from('controller_devices')
    .update(updates)
    .eq('device_id', normalizedId)
    .select('device_id, device_type, court_id, enabled, last_seen_at, created_at, courts(name)')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!updated) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  return NextResponse.json({
    device: {
      deviceId: updated.device_id,
      deviceType: updated.device_type,
      courtId: updated.court_id,
      courtName: (updated as any).courts?.name ?? null,
      enabled: updated.enabled,
      lastSeenAt: updated.last_seen_at,
      createdAt: updated.created_at,
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireStaff();
  if (auth.response) return auth.response;

  const { id } = await params;
  const normalizedId = id.trim().toLowerCase().replace(/[:-]/g, '');

  const admin = createAdminClient();
  const { error, count } = await admin
    .from('controller_devices')
    .delete({ count: 'exact' })
    .eq('device_id', normalizedId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (count === 0) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, deleted: normalizedId });
}
