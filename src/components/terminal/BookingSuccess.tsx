import { ShieldCheck, Check } from 'lucide-react';

interface Props {
  courtName?: string;
  duration: number;
  creditsUsed: number;
  creditsRemaining: number;
}

export function BookingSuccess({ courtName, duration, creditsUsed, creditsRemaining }: Props) {
  const isConfirmed = !!courtName;
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center animate-fade-in">
      {/* Animated Success Badge */}
      <div className={`size-16 rounded-full border flex items-center justify-center transition-all duration-550 scale-100 animate-pulse-subtle ${
        isConfirmed 
          ? 'bg-emerald-550/10 border-emerald-500/30 shadow-[0_0_20px_rgba(16,185,129,0.15)] text-emerald-400' 
          : 'bg-amber-500/10 border-amber-550/30 shadow-[0_0_20px_rgba(245,158,11,0.1)] text-amber-400'
      }`}>
        {isConfirmed ? (
          <ShieldCheck className="size-8 stroke-[1.5]" />
        ) : (
          <Check className="size-8 stroke-[2]" />
        )}
      </div>

      <div className="space-y-1.5">
        <h1 className="text-xl font-black text-zinc-100 tracking-wide">
          {isConfirmed ? 'Booking Confirmed!' : 'Added to Queue'}
        </h1>
        <p className="text-xs text-zinc-400 font-medium">
          {isConfirmed 
            ? `Successfully booked ${courtName} for ${duration} minutes.` 
            : `Your request for a ${duration} minute match is in the queue.`
          }
        </p>
      </div>

      {/* Glassmorphic Transaction Summary */}
      <div className="bg-gradient-to-br from-zinc-900/40 to-zinc-950/20 border border-zinc-800/80 rounded-2xl p-4.5 w-full max-w-xs shadow-md shadow-black/10 space-y-2.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500 font-medium">Credits Deducted</span>
          <span className="font-bold text-red-400">-₱{creditsUsed.toLocaleString()}</span>
        </div>
        <div className="h-px bg-zinc-800/50" />
        <div className="flex justify-between items-center text-xs">
          <span className="text-zinc-500 font-medium">Remaining Balance</span>
          <span className="font-bold text-emerald-400">₱{creditsRemaining.toLocaleString()}</span>
        </div>
      </div>

      <div className="text-[10px] text-zinc-600 font-semibold uppercase tracking-wider mt-4 animate-pulse">
        Returning to home screen...
      </div>
    </div>
  );
}

