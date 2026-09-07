interface Props { referenceCode: string; holdExpiresAt: string; onDone: () => void; }
export function GuestBookingSuccess({ referenceCode, holdExpiresAt, onDone }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center bg-[var(--booking-surface)]">
      <div className="size-14 rounded-full bg-secondary/15 border border-secondary/30 flex items-center justify-center text-secondary text-2xl font-bold">
        ✓
      </div>
      <h1 className="text-xl font-black text-[var(--booking-text)] tracking-wide">Request received</h1>
      <p className="max-w-xs text-xs sm:text-sm text-[var(--booking-muted)]">
        Paddle Point staff will contact you to confirm your schedule and payment. Your booking is not final until staff confirms it.
      </p>
      <div className="w-full max-w-xs rounded-2xl border border-[var(--booking-border)] bg-[var(--booking-card)] p-4 space-y-2 shadow-xs">
        <p className="text-[10px] uppercase tracking-widest text-[var(--booking-muted)] font-semibold">Reference</p>
        <p className="text-2xl font-black tracking-widest text-emerald-600 dark:text-[#72d493]">{referenceCode}</p>
        <p className="text-xs text-[var(--booking-subtle)]">Held until {new Date(holdExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
      </div>
      <button
        type="button"
        onClick={onDone}
        className="rounded-xl bg-secondary hover:bg-secondary/90 px-8 py-3 text-xs font-extrabold uppercase tracking-wider text-white active:scale-95 transition-all cursor-pointer shadow-md shadow-secondary/20"
      >
        Done
      </button>
    </div>
  );
}
