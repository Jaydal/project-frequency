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
      <div className="bg-gray-50 rounded-2xl p-5 shadow-sm border border-gray-200">
        <p className="text-sm text-gray-400">No active offers</p>
      </div>
    );
  }

  return (
    <div className="bg-amber-50 rounded-2xl p-5 shadow-sm border-2 border-amber-300">
      <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">
        Now Serving
      </div>
      <div className="text-2xl font-bold text-gray-900 mb-1">{playerNames}</div>
      <div className="text-sm text-gray-600 mb-3">
        {courtName} &middot; {duration} min
      </div>
      <div className={`text-4xl font-mono font-bold mb-1 ${isUrgent ? 'text-red-600 animate-pulse' : 'text-amber-700'}`}>
        {formatCountdown(remaining)}
      </div>
      <div className="text-xs text-gray-500">remaining to confirm at terminal</div>
    </div>
  );
}
