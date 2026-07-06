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
    ? 'bg-green-500'
    : status === 'disconnected' || status.startsWith('error')
    ? 'bg-red-500'
    : 'bg-yellow-500';
  return <span className={`inline-block w-3 h-3 rounded-full ${color} shrink-0`} />;
}

function StatCard({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="bg-white border rounded-lg p-4 flex items-start gap-3">
      <Icon size={20} className="text-gray-500 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <div className="text-sm text-gray-500">{label}</div>
        <div className="text-lg font-semibold truncate">{value}</div>
        {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
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

  if (loading) return <div className="text-center py-12 text-gray-500">Loading health data...</div>;
  if (!data) return <div className="text-center py-12 text-red-500">Failed to load health data</div>;

  const courtCount = Object.keys(data.courtDevices).length;
  const onlineCourts = Object.values(data.courtDevices).filter(d => d.status === 'online').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Activity size={24} className={data.ok ? 'text-green-500' : 'text-red-500'} />
        <h1 className="text-2xl font-bold">System Health</h1>
        <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${data.ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {data.ok ? 'All Systems Operational' : 'Degraded'}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Wifi} label="MQTT Broker" value={<span className="flex items-center gap-2"><Badge status={data.connections.broker} />{data.connections.broker}</span>} />
        <StatCard icon={Database} label="Supabase DB" value={<span className="flex items-center gap-2"><Badge status={data.connections.supabase} />{data.connections.supabase}</span>} />
        <StatCard icon={Monitor} label="Court Devices" value={`${onlineCourts}/${courtCount} online`} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Clock} label="Uptime" value={formatUptime(data.uptime)} />
        <StatCard icon={Server} label="Memory (RSS)" value={`${(data.memory.rss / 1024 / 1024).toFixed(0)} MB`} sub={`Heap: ${(data.memory.heapUsed / 1024 / 1024).toFixed(0)} / ${(data.memory.heapTotal / 1024 / 1024).toFixed(0)} MB`} />
        <StatCard icon={Server} label="Environment" value={data.env} sub={`Node ${data.node}`} />
      </div>

      <div className="bg-white border rounded-lg p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Monitor size={18} /> Court Device Status</h2>
        {courtCount === 0 ? (
          <p className="text-sm text-gray-500">No court devices have sent a heartbeat yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 pr-4">Court</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">IP</th>
                  <th className="pb-2 pr-4">RSSI</th>
                  <th className="pb-2 pr-4">Seen</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.courtDevices).map(([id, device]) => (
                  <tr key={id} className="border-b last:border-0">
                    <td className="py-2 pr-4 font-medium">{device.court || id}</td>
                    <td className="py-2 pr-4"><Badge status={device.status} /><span className="ml-2">{device.status}</span></td>
                    <td className="py-2 pr-4 text-gray-500">{device.ip || '-'}</td>
                    <td className="py-2 pr-4 text-gray-500">{device.rssi ?? '-'}</td>
                    <td className="py-2 pr-4 text-gray-500">{device.ago}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400">Last refreshed: {new Date(data.timestamp).toLocaleTimeString()} (auto-updates every 5s)</p>
    </div>
  );
}
