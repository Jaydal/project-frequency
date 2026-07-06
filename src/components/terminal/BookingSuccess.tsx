interface Props {
  courtName?: string;
  duration: number;
  creditsUsed: number;
  creditsRemaining: number;
}

export function BookingSuccess({ courtName, duration, creditsUsed, creditsRemaining }: Props) {
  const isConfirmed = !!courtName;
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
      <div className={`size-14 rounded-full border flex items-center justify-center ${
        isConfirmed ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-amber-500/10 border-amber-500/30'
      }`}>
        <svg className={`size-7 ${isConfirmed ? 'text-emerald-400' : 'text-amber-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-xl font-semibold text-zinc-100">{isConfirmed ? 'Booking Confirmed' : 'In the Queue'}</h1>
        <p className="text-sm text-zinc-400 mt-1">
          {isConfirmed ? `${courtName} · ${duration} min` : `${duration} min requested`}
        </p>
      </div>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 w-full max-w-xs">
        <div className="flex justify-between mb-2">
          <span className="text-xs text-zinc-500">Used</span>
          <span className="text-sm font-semibold text-red-400">-₱{creditsUsed}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-xs text-zinc-500">Remaining</span>
          <span className="text-sm font-semibold text-emerald-400">₱{creditsRemaining.toLocaleString()}</span>
        </div>
      </div>
      <p className="text-xs text-zinc-600">Returning to start screen...</p>
    </div>
  );
}
