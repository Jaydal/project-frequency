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
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-center mb-1">
            Choose Match Duration
          </div>

          <div className="grid grid-cols-3 gap-3 w-full max-w-lg mx-auto">
            {durations.map(d => {
              const per30 = rates[String(d)] ?? 0;
              const total = per30 * (d / 30);
              const label = getDurationLabel(d);
              const isPopular = d === 60; // Standard 60 mins is usually popular

              return (
                <button
                  key={d}
                  onClick={() => onSelect(d)}
                  className={`group relative bg-zinc-900/40 border rounded-2xl p-5 text-center transition-all duration-300 active:scale-[0.97] cursor-pointer flex flex-col items-center justify-between min-h-[160px] shadow-lg shadow-black/10 ${
                    isPopular 
                      ? 'border-emerald-500/50 bg-emerald-500/[0.01]' 
                      : 'border-zinc-800 hover:border-zinc-700'
                  }`}
                >
                  {isPopular && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-black tracking-wider uppercase shadow-sm">
                      Popular
                    </span>
                  )}

                  <div className="text-zinc-500 group-hover:text-emerald-400/80 transition-colors mt-2">
                    <Clock className="size-5" />
                  </div>

                  <div className="my-3">
                    <span className="text-3xl font-black text-zinc-100 group-hover:text-emerald-300 transition-colors block leading-none">
                      {d}
                    </span>
                    <span className="block text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-1">
                      minutes
                    </span>
                  </div>

                  <div className="w-full pt-2 border-t border-zinc-800/80">
                    <span className="block text-[10px] text-zinc-400 font-medium leading-none mb-1">{label}</span>
                    <span className="block text-sm font-extrabold text-emerald-400">₱{total}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button 
          onClick={onBack} 
          className="py-3 px-4 rounded-xl border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Game Format</span>
        </button>
      </div>
    </div>
  );
}

