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
          <div className="text-center mb-1"><div className="text-xl font-black tracking-tight text-[#f3f6f2]">How do you want to play?</div><div className="mt-1 text-xs text-[#9eaca3]">Choose the format that matches your group.</div>
          </div>

          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3 sm:gap-4 w-full max-w-lg mx-auto">
            {/* Singles Card */}
            <button
              onClick={() => onSelect('1v1')}
              className="group bg-[#203229] border border-[#40584a] rounded-2xl p-6 text-center hover:border-[#32A45E]/60 hover:bg-[#294335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] active:scale-[0.97] transition-all duration-300 cursor-pointer flex flex-col items-center justify-between min-h-[180px] shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-center gap-3 mt-2 text-primary-foreground/80 group-hover:text-secondary transition-colors">
                <User className="size-6 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-xs font-semibold text-zinc-600">vs</span>
                <User className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </div>

              <div className="mt-4">
                <div className="text-lg font-extrabold text-primary-foreground group-hover:text-secondary transition-colors">
                  Singles
                </div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
                  1 vs 1 Game
                </div>
              </div>

              <div className="text-xs text-zinc-400 mt-2 font-medium">
                2 players total • 1 credit rate
              </div>
            </button>

            {/* Doubles Card */}
            <button
              onClick={() => onSelect('2v2')}
              className="group bg-[#203229] border border-[#40584a] rounded-2xl p-6 text-center hover:border-[#32A45E]/60 hover:bg-[#294335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] active:scale-[0.97] transition-all duration-300 cursor-pointer flex flex-col items-center justify-between min-h-[180px] shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-center gap-2 mt-2 text-primary-foreground/80 group-hover:text-secondary transition-colors">
                <Users className="size-6 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-xs font-semibold text-zinc-600">vs</span>
                <Users className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </div>

              <div className="mt-4">
                <div className="text-lg font-extrabold text-primary-foreground group-hover:text-secondary transition-colors">
                  Doubles
                </div>
                <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">
                  2 vs 2 Game
                </div>
              </div>

              <div className="text-xs text-zinc-400 mt-2 font-medium">
                4 players total • Split or single pay
              </div>
            </button>
          </div>
        </div>

        <button 
          onClick={onBack} 
          className="py-3 px-4 rounded-xl border border-[#536a5c] text-xs font-bold uppercase tracking-wider text-[#d9e3dc] hover:text-[#FCFCF6] hover:bg-[#24372e] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Court Selection</span>
        </button>
      </div>
    </div>
  );
}
