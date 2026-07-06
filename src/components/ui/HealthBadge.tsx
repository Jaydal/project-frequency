'use client';

import { useEffect, useState } from 'react';

type Health = { ok: boolean; broker: string; db: string } | null;

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span className={`inline-block h-2 w-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`} />
      {label}
    </span>
  );
}

export default function HealthBadge() {
  const [health, setHealth] = useState<Health>(null);

  async function poll() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      setHealth(await res.json());
    } catch {
      setHealth({ ok: false, broker: 'disconnected', db: 'error' });
    }
  }

  useEffect(() => {
    poll();
    const t = setInterval(poll, 15_000);
    return () => clearInterval(t);
  }, []);

  if (!health) return null;

  return (
    <div className="flex items-center gap-3 rounded border px-3 py-1.5">
      <Dot ok={health.broker === 'connected'} label="Broker" />
      <Dot ok={health.db === 'ok'}            label="DB" />
    </div>
  );
}
