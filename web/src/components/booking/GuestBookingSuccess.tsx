interface Props { referenceCode: string; holdExpiresAt: string; onDone: () => void; }
export function GuestBookingSuccess({ referenceCode, holdExpiresAt, onDone }: Props) {
  return <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center bg-[#18261f]">
    <div className="text-4xl">✓</div>
    <h1 className="text-xl font-black text-[#FCFCF6]">Request received</h1>
    <p className="max-w-xs text-sm text-zinc-400">Paddle Point staff will contact you to confirm your schedule and payment. Your booking is not final until staff confirms it.</p>
    <div className="w-full max-w-xs rounded-2xl border border-[#2b4035] bg-[#1b2a23] p-4 space-y-2">
      <p className="text-[10px] uppercase tracking-widest text-zinc-500">Reference</p><p className="text-2xl font-black tracking-widest text-[#72d493]">{referenceCode}</p>
      <p className="text-xs text-zinc-500">Held until {new Date(holdExpiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
    </div>
    <button onClick={onDone} className="rounded-xl bg-[#32A45E] px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white">Done</button>
  </div>;
}
