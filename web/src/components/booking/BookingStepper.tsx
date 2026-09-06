import { User, X, Check } from 'lucide-react';

interface Step {
  label: string;
}

export const BOOKING_STEPS: Step[] = [
  { label: 'Court' },
  { label: 'Format' },
  { label: 'Duration' },
  { label: 'Review' },
];

interface Props {
  current: 0 | 1 | 2 | 3;
  steps?: string[];
  memberName?: string;
  balance?: number;
  onCancel?: () => void;
}

export const BOOKING_STEPPER_MIN_WIDTH_CLASS = 'overflow-x-auto';

export function BookingStepper({ current, steps = BOOKING_STEPS.map(step => step.label), memberName, balance, onCancel }: Props) {
  return (
    <div className="w-full px-3 pt-3 pb-2 sm:px-4 sm:pt-4 flex flex-col gap-3 sm:gap-4">
      {/* Member info header card */}
      <div className="flex min-w-0 items-center justify-between gap-2 bg-primary/40 backdrop-blur-md border border-primary-foreground/20 rounded-xl px-3 py-2.5 sm:px-4 shadow-sm">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/brand/primary-logo.svg" alt="Paddle Point" className="h-8 sm:h-10 w-auto max-w-[112px] object-contain object-left" />
          <div className="size-7 rounded-full bg-secondary/10 border border-secondary/20 flex items-center justify-center">
            <User className="size-4 text-secondary" />
          </div>
          <div className="flex min-w-0 flex-col">
            {memberName && (
              <span className="truncate text-xs font-semibold text-zinc-200 tracking-wide">{memberName}</span>
            )}
            {balance !== undefined && (
              <span className="text-[10px] font-medium text-secondary/90">
                Balance: <span className="font-bold">₱{balance.toLocaleString()}</span>
              </span>
            )}
          </div>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            aria-label="Cancel booking"
            className="shrink-0 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/60 transition-all cursor-pointer flex items-center gap-1.5 px-2 py-1.5 rounded-lg border border-transparent hover:border-zinc-800"
          >
            <X className="size-3.5" />
            <span className="hidden sm:inline">Cancel Booking</span>
          </button>
        )}
      </div>

      {/* Stepper nodes */}
      <div className={BOOKING_STEPPER_MIN_WIDTH_CLASS}>
        <div className="flex min-w-[360px] items-center justify-between px-1 pt-1 sm:min-w-0 sm:px-2">
          {steps.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={i} className="flex items-center flex-1 last:flex-initial" aria-current={active ? 'step' : undefined}>
              {/* Node */}
              <div className="flex flex-col items-center shrink-0 relative">
                <div
                  className={`size-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all duration-300 ${
                    done
                      ? 'bg-secondary border-secondary text-white shadow-[0_0_12px_rgba(50,164,94,0.3)]'
                      : active
                      ? 'bg-primary border-secondary text-secondary shadow-[0_0_15px_rgba(50,164,94,0.2)]'
                      : 'bg-primary border-primary-foreground/20 text-primary-foreground/80'
                  }`}
                >
                  {done ? (
                    <Check className="size-4 stroke-[3]" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </div>
                <span
                  className={`mt-1.5 whitespace-nowrap text-[8px] font-bold tracking-[0.08em] uppercase transition-all duration-300 sm:text-[9px] sm:tracking-wider ${
                    done ? 'text-secondary' : active ? 'text-primary-foreground' : 'text-primary-foreground/80'
                  }`}
                >
                  {step}
                </span>
              </div>

              {/* Connector line (not after last) */}
              {i < steps.length - 1 && (
                <div className="flex-1 h-[2px] mx-2 mb-5 relative bg-primary-foreground/20 rounded-full overflow-hidden">
                  <div 
                    className={`absolute inset-y-0 left-0 transition-all duration-500 ease-out bg-gradient-to-r from-secondary to-secondary/80 ${
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
    </div>
  );
}
