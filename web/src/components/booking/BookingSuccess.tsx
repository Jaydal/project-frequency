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
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-5 text-center animate-fade-in bg-[var(--booking-surface)]">
      {/* Animated Success Badge */}
      <div className={`size-16 rounded-full border flex items-center justify-center transition-all duration-550 scale-100 animate-pulse-subtle ${
        isConfirmed 
          ? 'bg-[#32A45E]/15 border-[#32A45E]/40 shadow-[0_0_20px_rgba(50,164,94,0.15)] text-emerald-600 dark:text-[#72d493]'
          : 'bg-[#d9a441]/15 border-[#d9a441]/40 shadow-[0_0_20px_rgba(217,164,65,0.1)] text-amber-600 dark:text-[#e2b85a]'
      }`}>
        {isConfirmed ? (
          <ShieldCheck className="size-8 stroke-[1.5]" />
        ) : (
          <Check className="size-8 stroke-[2]" />
        )}
      </div>

      <div className="space-y-1.5">
        <h1 className="text-xl font-black text-[var(--booking-text)] tracking-wide">
          {isConfirmed ? 'Booking Confirmed!' : 'Added to Queue'}
        </h1>
        <p className="text-xs text-[var(--booking-muted)] font-medium">
          {isConfirmed 
            ? `Successfully booked ${courtName} for ${duration} minutes.` 
            : `Your request for a ${duration} minute match is in the queue.`
          }
        </p>
      </div>

      {/* Transaction Summary */}
      <div className="bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-4.5 w-full max-w-xs shadow-xs space-y-2.5">
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--booking-muted)] font-medium">Credits Deducted</span>
          <span className="font-bold text-red-500 dark:text-red-400">-₱{creditsUsed.toLocaleString()}</span>
        </div>
        <div className="h-px bg-[var(--booking-border)]/60" />
        <div className="flex justify-between items-center text-xs">
          <span className="text-[var(--booking-muted)] font-medium">Remaining Balance</span>
          <span className="font-bold text-emerald-600 dark:text-[#72d493]">₱{creditsRemaining.toLocaleString()}</span>
        </div>
      </div>

      <div className="text-[10px] text-[var(--booking-subtle)] font-semibold uppercase tracking-wider mt-4 animate-pulse">
        Returning to home screen...
      </div>
    </div>
  );
}
