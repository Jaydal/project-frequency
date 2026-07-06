import { createClient } from '@/lib/supabase/server'

export async function getControllerUrl(): Promise<string | null> {
  if (process.env.CONTROLLER_URL) return process.env.CONTROLLER_URL;
  const supabase = await createClient();
  const { data } = await supabase
    .from('controller_logs')
    .select('ip_address')
    .order('last_sync', { ascending: false })
    .limit(1)
    .single();
  if (!data?.ip_address) return null;
  return `http://${data.ip_address}`;
}

export async function pushDisplay(lines: [string, string, string]): Promise<boolean> {
  const url = await getControllerUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/display`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pushDisplayRow(row: 0 | 1 | 2, text: string): Promise<boolean> {
  const url = await getControllerUrl();
  if (!url) return false;
  try {
    const res = await fetch(`${url}/display/${row}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getDisplayState(): Promise<{ lines: string[] } | null> {
  const url = await getControllerUrl();
  if (!url) return null;
  try {
    const res = await fetch(`${url}/display`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}
