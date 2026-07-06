'use client';

import { useEffect, useState, useCallback } from 'react';
import { Activity, Wifi, Database, Monitor, Server, Clock } from 'lucide-react';

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
    ? 'bg-emerald-500'
    : status === 'disconnected' || status.startsWith('error')
    ? 'bg-red-500'
    : 'bg-amber-500';
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${color} shrink-0`} />;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-4 flex items-start gap-3">
      <Icon size={18} className="text-zinc-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="text-base font-semibold text-zinc-100 truncate">{value}</div>
        {sub && <div className="text-xs text-zinc-600 mt-0.5">{sub}</div>}
      </div>
    </div>
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity size={22} className={data.ok ? 'text-emerald-400' : 'text-red-400'} />
        <h1 className="text-2xl font-bold text-zinc-100">System Health</h1>
        <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${
          data.ok ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          {data.ok ? 'All Systems Operational' : 'Degraded'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Wifi} label="MQTT Broker" value={<span className="flex items-center gap-2"><Badge status={data.connections.broker} /><span className="text-zinc-100">{data.connections.broker}</span></span>} />
        <StatCard icon={Database} label="Supabase DB" value={<span className="flex items-center gap-2"><Badge status={data.connections.supabase} /><span className="text-zinc-100">{data.connections.supabase}</span></span>} />
        <StatCard icon={Monitor} label="Court Devices" value={`${onlineCourts}/${courtCount} online`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Clock} label="Uptime" value={formatUptime(data.uptime)} />
        <StatCard icon={Server} label="Memory (RSS)" value={`${(data.memory.rss / 1024 / 1024).toFixed(0)} MB`} sub={`Heap: ${(data.memory.heapUsed / 1024 / 1024).toFixed(0)} / ${(data.memory.heapTotal / 1024 / 1024).toFixed(0)} MB`} />
        <StatCard icon={Server} label="Environment" value={data.env} sub={`Node ${data.node}`} />
      </div>

      <div className="bg-zinc-900/80 backdrop-blur-sm border border-zinc-800/50 rounded-xl p-5">
        <h2 className="font-semibold text-zinc-100 mb-3 flex items-center gap-2 text-sm"><Monitor size={16} /> Court Device Status</h2>
        {courtCount === 0 ? (
          <p className="text-sm text-zinc-500">No court devices have sent a heartbeat yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-zinc-500 border-b border-zinc-800">
                  <th className="pb-2 pr-4 font-medium">Court</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">IP</th>
                  <th className="pb-2 pr-4 font-medium">RSSI</th>
                  <th className="pb-2 pr-4 font-medium">Seen</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.courtDevices).map(([id, device]) => (
                  <tr key={id} className="border-b border-zinc-800/50 last:border-0">
                    <td className="py-2.5 pr-4 font-medium text-zinc-200">{device.court || id}</td>
                    <td className="py-2.5 pr-4"><Badge status={device.status} /><span className="ml-2 text-zinc-300">{device.status}</span></td>
                    <td className="py-2.5 pr-4 text-zinc-500">{device.ip || '-'}</td>
                    <td className="py-2.5 pr-4 text-zinc-500">{device.rssi ?? '-'}</td>
                    <td className="py-2.5 pr-4 text-zinc-500">{device.ago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-zinc-600">Last refreshed: {new Date(data.timestamp).toLocaleTimeString()} (auto-updates every 5s)</p>
    </div>
  );
}
