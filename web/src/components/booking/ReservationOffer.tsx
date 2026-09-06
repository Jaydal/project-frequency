'use client';

import { useState, useEffect } from 'react';
import { Check, X, Clock, AlertTriangle } from 'lucide-react';

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
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center animate-fade-in bg-[#18261f]">
      {/* Dynamic Glow Badge */}
      <div className={`size-16 rounded-full border flex items-center justify-center transition-all duration-500 scale-100 ${
        expired
          ? 'bg-red-500/10 border-red-500/30 shadow-[0_0_20px_rgba(239,68,68,0.15)] text-red-400'
          : isUrgent
          ? 'bg-amber-500/10 border-amber-550/30 shadow-[0_0_25px_rgba(245,158,11,0.25)] text-amber-400 animate-pulse'
          : 'bg-[#32A45E]/15 border-[#32A45E]/40 shadow-[0_0_25px_rgba(50,164,94,0.2)] text-[#72d493]'
      }`}>
        {expired ? (
          <X className="size-8 stroke-[2.5]" />
        ) : (
          <Clock className={`size-8 stroke-[1.5] ${isUrgent ? 'animate-spin-slow' : ''}`} />
        )}
      </div>

      <div className="space-y-1">
        <h1 className="text-xl font-black text-[#FCFCF6] tracking-wide">
          {expired ? 'Offer Expired' : 'Your Court is Ready!'}
        </h1>
        <p className="text-xs text-secondary font-bold uppercase tracking-wider">
          {courtName}
        </p>
      </div>

      {!expired && (
        <div className="w-full flex flex-col items-center gap-4 mt-2">
          {/* Beautiful countdown text box */}
          <div className={`px-8 py-4.5 rounded-2xl border transition-all duration-300 ${
            isUrgent 
              ? 'border-red-500/20 bg-red-500/[0.02]' 
              : 'border-[#2b4035] bg-[#1b2a23]'
          }`}>
            <p className={`text-4xl font-mono font-black tracking-tight tabular-nums ${isUrgent ? 'text-[#ff9b9b]' : 'text-[#72d493]'}`}>
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mt-1">Remaining to claim</p>
          </div>

          {isUrgent && (
            <p className="text-[10px] font-bold text-red-400 animate-pulse flex items-center gap-1">
              <AlertTriangle className="size-3" /> Tap Accept quickly before the offer expires!
            </p>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 w-full max-w-xs mt-2">
            <button 
              onClick={onDecline} 
              disabled={busy}
              className="flex-1 py-3.5 bg-[#24372e] text-[#d9e3dc] border border-[#536a5c] rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#2d4638] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Decline
            </button>
            <button 
              onClick={onAccept} 
              disabled={busy}
              className={`flex-1 py-3.5 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${
                isUrgent
                  ? 'bg-amber-500 hover:bg-amber-450 shadow-md shadow-amber-500/10'
                  : 'bg-secondary hover:bg-secondary/90 shadow-md shadow-secondary/10'
              }`}
            >
              {busy ? (
                <>
                  <div className="size-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Accepting...</span>
                </>
              ) : (
                <span>Accept</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
