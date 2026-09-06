import Image from 'next/image';

export const TERMINAL_BRAND_MOTION_CLASS = 'motion-safe:animate-terminal-ball motion-reduce:animate-none';

export function BookingBrandPanel() {
  return (
    <div aria-hidden="true" className="relative mx-4 my-3 hidden min-h-[116px] overflow-hidden rounded-2xl border border-[#294033] bg-[radial-gradient(circle_at_20%_0%,#284632,#111a15_72%)] px-4 py-3 sm:block">
      <div className="relative z-10 flex h-full flex-col justify-between">
        <Image src="/brand/primary-logo.svg" alt="" width={150} height={96} className="h-10 w-auto max-w-[180px] object-contain object-left" />
        <div><p className="text-[9px] font-black uppercase tracking-[0.22em] text-[#7bd694]">Play more · play better</p><p className="mt-0.5 text-[9px] text-[#829188]">Your court is waiting.</p></div>
      </div>
      <div className={`absolute right-4 top-4 size-16 rounded-full bg-[radial-gradient(circle_at_30%_26%,#f6fff0_0_6%,#c6e9bb_8%_16%,#62bd77_38%,#237342_72%,#0a2a15_100%)] shadow-[-8px_12px_24px_#0008] ${TERMINAL_BRAND_MOTION_CLASS}`}>
        <span className="absolute inset-2 rounded-full border border-[#d7f7d866] rotate-[-24deg]" />
        <span className="absolute inset-1 rounded-full border-x border-[#d7f7d855] rotate-[32deg]" />
      </div>
    </div>
  );
}
