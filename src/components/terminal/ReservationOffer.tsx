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
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-amber-50 to-white">
      <div className="text-6xl mb-4">🎯</div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Court Ready!</h1>
      <p className="text-xl text-gray-700 font-semibold mb-1">{courtName}</p>

      {expired ? (
        <p className="text-red-600 font-semibold text-lg mb-4">Offer Expired</p>
      ) : (
        <>
          <div className={`text-6xl font-mono font-bold my-4 ${isUrgent ? 'text-red-600 animate-pulse' : 'text-amber-700'}`}>
            {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </div>
          <p className="text-sm text-gray-500 mb-6">remaining to confirm</p>

          <div className="flex gap-4 w-full max-w-xs">
            <button onClick={onDecline} disabled={busy}
              className="flex-1 py-4 bg-gray-100 rounded-2xl text-lg font-medium cursor-pointer active:bg-gray-200 disabled:opacity-40"
            >
              Decline
            </button>
            <button onClick={onAccept} disabled={busy}
              className="flex-1 py-4 bg-green-600 text-white rounded-2xl text-lg font-bold cursor-pointer active:bg-green-700 disabled:opacity-40"
            >
              {busy ? 'Accepting...' : 'Accept'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
