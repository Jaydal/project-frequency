import { User, X, Check } from 'lucide-react';

interface Step {
  label: string;
}

const STEPS: Step[] = [
  { label: 'Court' },
  { label: 'Game Type' },
  { label: 'Duration' },
  { label: 'Confirm' },
];

interface Props {
  current: 0 | 1 | 2 | 3;
  memberName?: string;
  balance?: number;
  onCancel?: () => void;
}

export function BookingStepper({ current, memberName, balance, onCancel }: Props) {
  return (
    <div className="w-full px-4 pt-4 pb-2 flex flex-col gap-4">
      {/* Member info header card */}
      <div className="flex items-center justify-between bg-zinc-900/40 backdrop-blur-md border border-zinc-800/80 rounded-xl px-4 py-2.5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <User className="size-4 text-emerald-400" />
          </div>
          <div className="flex flex-col">
            {memberName && (
              <span className="text-xs font-semibold text-zinc-200 tracking-wide">{memberName}</span>
            )}
            {balance !== undefined && (
              <span className="text-[10px] font-medium text-emerald-400/90">
                Balance: <span className="font-bold">₱{balance.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all cursor-pointer flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-transparent hover:border-zinc-800"
          >
            <X className="size-3.5" />
            <span>Cancel Booking</span>
          </button>
        )}
      </div>

      {/* Stepper nodes */}
      <div className="flex items-center justify-between px-2 pt-1">
        {STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-initial">
              {/* Node */}
              <div className="flex flex-col items-center shrink-0 relative">
                <div
                  className={`size-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                    done
                      ? 'bg-emerald-500 border-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                      : active
                      ? 'bg-zinc-950 border-emerald-400 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.2)]'
                      : 'bg-zinc-950 border-zinc-850 text-zinc-650'
                  }`}
                >
                  {done ? (
                    <Check className="size-4 stroke-[3]" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`text-[9px] mt-1.5 font-bold tracking-wider uppercase transition-all duration-300 ${
                    done ? 'text-emerald-400' : active ? 'text-zinc-100' : 'text-zinc-600'
                  }`}
                >
                  {step.label}
                </span>
              </div>

              {/* Connector line (not after last) */}
              {i < STEPS.length - 1 && (
                <div className="flex-1 h-[2px] mx-2 mb-5 relative bg-zinc-900 rounded-full overflow-hidden">
                  <div 
                    className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out bg-gradient-to-r from-emerald-500 to-emerald-400 ${
                      done ? 'w-full' : 'w-0'
                    }`} 
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

