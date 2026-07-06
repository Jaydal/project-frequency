'use client';

import { useState, useEffect } from 'react';

interface Props {
  courtName: string;
  expiresAt: string | null;
  onAccept: () => void;
  onDecline: () => void;
  busy: boolean;
}

export function ReservationOffer({ courtName, expiresAt, onAccept, onDecline, busy }: Props) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    function tick() {
      if (!expiresAt) { setRemaining(0); return; }
      setRemaining(Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  const isUrgent = remaining > 0 && remaining < 60;
  const expired = remaining <= 0;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <div className={`size-14 rounded-full border flex items-center justify-center ${
        expired
          ? 'bg-red-500/10 border-red-500/30'
          : 'bg-emerald-500/10 border-emerald-500/30'
      }`}>
        <svg className={`size-7 ${expired ? 'text-red-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {expired
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          }
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-100">{expired ? 'Offer Expired' : 'Court Ready!'}</h1>
        <p className="text-sm text-zinc-400 mt-0.5">{courtName}</p>
      </div>

      {!expired && (
        <>
          <p className={`text-4xl font-mono font-bold tabular-nums ${isUrgent ? 'text-red-400' : 'text-emerald-400'}`}>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </p>
          <p className="text-xs text-zinc-500 -mt-2">remaining to confirm</p>

          <div className="flex gap-2 w-full max-w-xs">
            <button onClick={onDecline} disabled={busy}
              className="flex-1 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-sm font-medium text-zinc-300 hover:bg-zinc-700 cursor-pointer disabled:opacity-40"
            >
              Decline
            </button>
            <button onClick={onAccept} disabled={busy}
              className="flex-1 py-3 bg-emerald-500 text-black rounded-lg text-sm font-semibold hover:bg-emerald-400 cursor-pointer disabled:opacity-40"
            >
              {busy ? 'Accepting...' : 'Accept'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
