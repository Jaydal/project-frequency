'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Activity, ExternalLink, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

type Device = { status: string; ip?: string; rssi?: number; court?: string; ago: string };
type Health = { courtDevices: Record<string, Device>; ok: boolean };

function statusStyle(status: string) {
  if (status === 'online' || status === 'connected' || status === 'ok') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  if (status === 'offline' || status.startsWith('error')) return 'bg-red-500/10 text-red-300 border-red-500/20';
  return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
}

export function KioskStatusPanel() {
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok && !data.courtDevices) throw new Error('Unable to read device health.');
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to read device health.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 10_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const devices = Object.entries(health?.courtDevices ?? {});
  const online = devices.filter(([, device]) => device.status === 'online').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-300">Physical terminals report through the court controller heartbeat.</p>
          <p className="mt-1 text-xs text-zinc-500">Refreshes automatically every 10 seconds.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="border-zinc-700 text-zinc-200 hover:bg-zinc-800">
            <RefreshCw className={loading ? 'animate-spin' : ''} /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => window.location.href = '/booking'}>
            <ExternalLink /> Preview terminal
          </Button>
        </div>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4"><p className="text-[10px] uppercase tracking-wider text-zinc-500">Registered devices</p><p className="mt-1 text-2xl font-black text-zinc-100">{devices.length}</p></div>
        <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-4"><p className="text-[10px] uppercase tracking-wider text-emerald-400/70">Online</p><p className="mt-1 text-2xl font-black text-emerald-300">{online}</p></div>
        <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-4"><p className="text-[10px] uppercase tracking-wider text-amber-400/70">Needs attention</p><p className="mt-1 text-2xl font-black text-amber-300">{Math.max(devices.length - online, 0)}</p></div>
      </div>

      {loading && !health ? <p className="py-8 text-center text-sm text-zinc-500">Reading kiosk status…</p> : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/30 px-6 py-10 text-center"><WifiOff className="mx-auto mb-3 text-zinc-500" /><p className="font-semibold text-zinc-300">No kiosk heartbeats yet</p><p className="mt-1 text-sm text-zinc-500">Connect a terminal and it will appear here.</p></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="hidden grid-cols-[1.5fr_1fr_1fr_1fr] gap-4 border-b border-zinc-800 bg-zinc-950/60 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-zinc-500 sm:grid"><span>Terminal / court</span><span>Status</span><span>Network</span><span>Last heartbeat</span></div>
          {devices.map(([id, device]) => (
            <div key={id} className="grid gap-2 border-b border-zinc-800/80 px-4 py-4 last:border-0 sm:grid-cols-[1.5fr_1fr_1fr_1fr] sm:items-center sm:gap-4">
              <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300"><Activity size={16} /></span><div><p className="font-semibold text-zinc-100">{device.court || id}</p><p className="font-mono text-[10px] text-zinc-500">{id}</p></div></div>
              <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(device.status)}`}>{device.status === 'online' ? <Wifi size={12} /> : <WifiOff size={12} />}{device.status}</span>
              <span className="text-sm text-zinc-400">{device.ip || 'No IP'}{device.rssi ? ` · ${device.rssi} dBm` : ''}</span>
              <span className="text-sm text-zinc-500">{device.ago} ago</span>
            </div>
          ))}
        </div>
      )}
      <Link href="/health" className="inline-flex text-sm font-semibold text-emerald-400 hover:text-emerald-300">Open full system health →</Link>
    </div>
  );
}
