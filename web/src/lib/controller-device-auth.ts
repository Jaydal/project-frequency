import { createAdminClient } from '@/lib/supabase/admin';

const DEVICE_ID_PATTERN = /^(?:[0-9a-f]{12}|simulator)$/;

export type ControllerDeviceType = 'kiosk' | 'display';

export type ControllerDevice = {
  device_id: string;
  device_type: 'kiosk' | 'display';
  court_id: string | null;
};

export async function authenticateControllerDevice(
  request: Request,
  requiredType?: ControllerDeviceType,
): Promise<ControllerDevice | null> {
  const rawId = request.headers.get('x-device-id')?.trim().toLowerCase() ?? '';
  if (!DEVICE_ID_PATTERN.test(rawId)) return null;
  if (rawId === 'simulator' && process.env.NODE_ENV === 'production') return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }
  const { data, error } = await admin
    .from('controller_devices')
    .select('device_id, device_type, court_id')
    .eq('device_id', rawId)
    .eq('enabled', true)
    .maybeSingle();
  if (error || !data) return null;

  if (requiredType && data.device_type !== requiredType) return null;

  await admin
    .from('controller_devices')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('device_id', rawId);

  return data as ControllerDevice;
}
