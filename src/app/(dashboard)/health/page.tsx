'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, Wifi, Database, Monitor, Server, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type HealthData = {
  ok: boolean;
  timestamp: string;
  uptime: number;
  memory: { rss: number; heapTotal: number; heapUsed: number };
  node: string;
  env: string;
  connections: {
    broker: string;
    supabase: string;
  };
  courtDevices: Record<string, {
    status: string;
    ip?: string;
    rssi?: number;
    court?: string;
    seenAt: number;
    ago: string;
  }>;
};

function formatUptime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${h}h ${m}m ${s}s`;
}

function Badge({ status }: { status: string }) {
  const color = status === 'connected' || status === 'ok'
    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]'
    : status === 'disconnected' || status.startsWith('error')
    ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]'
    : 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.4)]';
  return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
      <CardContent className="p-4 flex items-start gap-3">
        <Icon size={18} className="text-zinc-500 mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">{label}</div>
          <div className="text-base font-bold text-zinc-200 truncate mt-0.5">{value}</div>
          {sub && <div className="text-[10px] text-zinc-500 mt-0.5">{sub}</div>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      const json = await res.json();
      setData(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const id = setInterval(fetchHealth, 5000);
    return () => clearInterval(id);
  }, [fetchHealth]);

  if (loading) return <div className="text-center py-12 text-zinc-500">Loading health data...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">Failed to load health data</div>;

  const courtCount = Object.keys(data.courtDevices).length;
  const onlineCourts = Object.values(data.courtDevices).filter(d => d.status === 'online').length;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Activity size={22} className={data.ok ? 'text-emerald-400' : 'text-red-400'} />
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">System Health</h1>
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
          data.ok
            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
            : 'bg-red-500/10 text-red-400 border-red-500/20'
        }`}>
          {data.ok ? 'All Systems Operational' : 'Degraded'}
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard 
          icon={Wifi} 
          label="MQTT Broker" 
          value={
            <span className="flex items-center gap-2">
              <Badge status={data.connections.broker} />
              <span className="text-zinc-200 capitalize">{data.connections.broker}</span>
            </span>
          } 
          sub={(data.connections as any).brokerConfigured ? "Credentials Loaded" : "Missing Vercel Env Variables"}
        />
        <StatCard 
          icon={Database} 
          label="Supabase DB" 
          value={
            <span className="flex items-center gap-2">
              <Badge status={data.connections.supabase} />
              <span className="text-zinc-200 capitalize">{data.connections.supabase}</span>
            </span>
          } 
        />
        <StatCard icon={Monitor} label="Court Devices" value={`${onlineCourts} / ${courtCount} Online`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard icon={Clock} label="Server Uptime" value={formatUptime(data.uptime)} />
        <StatCard icon={Server} label="Memory (RSS)" value={`${(data.memory.rss / 1024 / 1024).toFixed(0)} MB`} sub={`Heap: ${(data.memory.heapUsed / 1024 / 1024).toFixed(0)} / ${(data.memory.heapTotal / 1024 / 1024).toFixed(0)} MB`} />
        <StatCard icon={Server} label="Environment" value={data.env} sub={`Node ${data.node}`} />
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-950/20 flex items-center gap-2">
          <Monitor size={16} className="text-zinc-400" />
          <h2 className="font-semibold text-zinc-250 text-sm">Court Device Registry</h2>
        </div>
        <CardContent className="p-0">
          {courtCount === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">No court devices have reported heartbeats yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-zinc-950/40">
                  <tr className="text-zinc-400 font-semibold border-b border-zinc-800">
                    <th className="py-3 px-4">Court Name</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">IP Address</th>
                    <th className="py-3 px-4">Signal (RSSI)</th>
                    <th className="py-3 px-4 pr-6">Last Heartbeat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800 text-zinc-300">
                  {Object.entries(data.courtDevices).map(([id, device]) => (
                    <tr key={id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                      <td className="py-3.5 px-4 font-semibold text-zinc-200">{device.court || id}</td>
                      <td className="py-3.5 px-4">
                        <span className="flex items-center gap-2">
                          <Badge status={device.status} />
                          <span className="capitalize">{device.status}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-zinc-400">{device.ip || '—'}</td>
                      <td className="py-3.5 px-4 text-zinc-400">{device.rssi ? `${device.rssi} dBm` : '—'}</td>
                      <td className="py-3.5 px-4 text-zinc-500 pr-6">{device.ago}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-zinc-500">Last refreshed: {new Date(data.timestamp).toLocaleTimeString()} &bull; Auto-updates every 5s</p>
    </div>
  );
}
