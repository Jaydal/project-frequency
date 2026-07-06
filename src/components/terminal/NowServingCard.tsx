'use client';

import { useState, useEffect } from 'react';

interface Props {
  playerNames: string;
  courtName: string;
  duration: number;
  expiresAt: string | null;
}

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function NowServingCard({ playerNames, courtName, duration, expiresAt }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : 0;

  const isUrgent = remaining > 0 && remaining < 60;

  if (!expiresAt || remaining <= 0) {
    return (
      <div className="bg-zinc-900 rounded-lg p-4 border border-zinc-800">
        <p className="text-xs text-zinc-500">No active offers</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 rounded-lg p-4 border border-emerald-500/30">
      <p className="text-xs font-medium text-emerald-400 uppercase tracking-wider mb-1">Now Serving</p>
      <p className="text-lg font-semibold text-zinc-100 mb-0.5">{playerNames}</p>
      <p className="text-xs text-zinc-500 mb-2">{courtName} &middot; {duration} min</p>
      <p className={`text-3xl font-mono font-bold tabular-nums ${isUrgent ? 'text-red-400' : 'text-emerald-400'}`}>
        {formatCountdown(remaining)}
      </p>
      <p className="text-xs text-zinc-500 mt-1">remaining to confirm</p>
    </div>
  );
}
