import { BookingStepper } from './BookingStepper';
import { Clock, ArrowLeft } from 'lucide-react';

interface Props {
  member?: any;
  durations: number[];
  rates: Record<string, number>;
  onSelect: (duration: number) => void;
  onBack: () => void;
  onCancel?: () => void;
}

export function SelectDuration({ member, durations, rates, onSelect, onBack, onCancel }: Props) {

  // Simple helper to describe durations
  const getDurationLabel = (mins: number) => {
    if (mins <= 30) return 'Quick Match';
    if (mins <= 60) return 'Standard Play';
    return 'Extended Session';
  };

  return (
    <div className="flex-1 flex flex-col h-full">
      <BookingStepper
        current={2}
        memberName={member ? `${member.firstName} ${member.lastName}` : undefined}
        balance={member?.balance}
        onCancel={onCancel}
      />

      <div className="flex-1 flex flex-col px-5 pb-5 justify-between gap-4 overflow-y-auto">
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          <div className="text-center mb-1"><div className="text-xl font-black tracking-tight text-[#f3f6f2]">How long would you like to play?</div><div className="mt-1 text-xs text-[#9eaca3]">Pick a duration and review the credit requirement.</div>
          </div>

          <div className="grid grid-cols-1 min-[380px]:grid-cols-3 gap-3 w-full max-w-lg mx-auto">
            {durations.map(d => {
              const per30 = rates[String(d)] ?? 0;
              const total = per30 * (d / 30);
              const label = getDurationLabel(d);
              const isPopular = d === 60; // Standard 60 mins is usually popular

              return (
                <button
                  key={d}
                  onClick={() => onSelect(d)}
                  className={`group relative bg-[#203229] border border-[#40584a] rounded-2xl p-5 text-center transition-all duration-300 active:scale-[0.97] cursor-pointer flex flex-col items-center justify-between min-h-[160px] shadow-lg shadow-black/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] ${
                    isPopular
                      ? 'border-[#32A45E]/65 bg-[#294335]'
                      : 'border-[#40584a] hover:border-[#536a5c]'
                  }`}
                >
                  {isPopular && (
                     <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold px-2 py-0.5 rounded-full bg-secondary text-white tracking-wider uppercase shadow-sm">
                      Popular
                    </span>
                  )}

                  <div className="text-primary-foreground/80 group-hover:text-secondary transition-colors mt-2">
                    <Clock className="size-5" />
                  </div>

                  <div className="my-3">
                    <span className="text-3xl font-black text-primary-foreground group-hover:text-secondary transition-colors block leading-none">
                      {d}
                    </span>
                    <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">
                      minutes
                    </span>
                  </div>

                  <div className="w-full pt-2 border-t border-zinc-800/80">
                    <span className="block text-[10px] text-zinc-400 font-medium leading-none mb-1">{label}</span>
                    <span className="block text-sm font-extrabold text-secondary">₱{total}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button 
          onClick={onBack} 
          className="py-3 px-4 rounded-xl border border-[#536a5c] text-xs font-bold uppercase tracking-wider text-[#d9e3dc] hover:text-[#FCFCF6] hover:bg-[#24372e] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Game Format</span>
        </button>
      </div>
    </div>
  );
}
