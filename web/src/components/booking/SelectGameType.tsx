import { BookingStepper } from './BookingStepper';
import { User, Users, ArrowLeft } from 'lucide-react';

interface Props {
  member?: any;
  onSelect: (gameType: '1v1' | '2v2') => void;
  onBack: () => void;
  onCancel?: () => void;
}

export function SelectGameType({ member, onSelect, onBack, onCancel }: Props) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <BookingStepper
        current={1}
        memberName={member ? `${member.firstName} ${member.lastName}` : undefined}
        balance={member?.balance}
        onCancel={onCancel}
      />

      <div className="flex-1 flex flex-col px-5 pb-5 justify-between gap-4 overflow-y-auto">
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          <div className="text-center mb-1">
            <div className="text-xl font-black tracking-tight text-[var(--booking-text)]">How do you want to play?</div>
            <div className="mt-1 text-xs text-[var(--booking-muted)]">Choose the format that matches your group.</div>
          </div>

          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:gap-4 w-full max-w-lg mx-auto">
            {/* Singles Card */}
            <button
              type="button"
              onClick={() => onSelect('1v1')}
              className="group bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-6 text-center hover:border-[#32A45E]/60 hover:bg-[var(--booking-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] active:scale-[0.97] transition-all duration-300 cursor-pointer flex flex-col items-center justify-between min-h-[180px] shadow-xs"
            >
              <div className="flex items-center justify-center gap-3 mt-2 text-secondary group-hover:text-secondary transition-colors">
                <User className="size-6 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-xs font-semibold text-[var(--booking-muted)]">vs</span>
                <User className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </div>

              <div className="mt-4">
                <div className="text-lg font-extrabold text-[var(--booking-text)] group-hover:text-secondary transition-colors">
                  Singles
                </div>
                <div className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-wider mt-0.5">
                  1 vs 1 Game
                </div>
              </div>

              <div className="text-xs text-[var(--booking-subtle)] mt-2 font-medium">
                2 players total • 1 credit rate
              </div>
            </button>

            {/* Doubles Card */}
            <button
              type="button"
              onClick={() => onSelect('2v2')}
              className="group bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-6 text-center hover:border-[#32A45E]/60 hover:bg-[var(--booking-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] active:scale-[0.97] transition-all duration-300 cursor-pointer flex flex-col items-center justify-between min-h-[180px] shadow-xs"
            >
              <div className="flex items-center justify-center gap-2 mt-2 text-secondary group-hover:text-secondary transition-colors">
                <Users className="size-6 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-xs font-semibold text-[var(--booking-muted)]">vs</span>
                <Users className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </div>

              <div className="mt-4">
                <div className="text-lg font-extrabold text-[var(--booking-text)] group-hover:text-secondary transition-colors">
                  Doubles
                </div>
                <div className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-wider mt-0.5">
                  2 vs 2 Game
                </div>
              </div>

              <div className="text-xs text-[var(--booking-subtle)] mt-2 font-medium">
                4 players total • Split or single pay
              </div>
            </button>
          </div>
        </div>

        <button 
          type="button"
          onClick={onBack} 
          className="py-3 px-4 rounded-xl border border-[var(--booking-border)] text-xs font-bold uppercase tracking-wider text-[var(--booking-text)] hover:bg-[var(--booking-panel)] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Court Selection</span>
        </button>
      </div>
    </div>
  );
}
