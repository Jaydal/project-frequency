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
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest text-center mb-1">
            Select Game Format
          </div>

          <div className="grid grid-cols-2 gap-4 w-full max-w-lg mx-auto">
            {/* Singles Card */}
            <button
              onClick={() => onSelect('1v1')}
              className="group bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 text-center hover:border-emerald-500/50 hover:bg-emerald-500/[0.01] active:scale-[0.97] transition-all duration-300 cursor-pointer flex flex-col items-center justify-between min-h-[180px] shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-center gap-3 mt-2 text-zinc-400 group-hover:text-emerald-450 transition-colors">
                <User className="size-6 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-xs font-semibold text-zinc-600">vs</span>
                <User className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </div>

              <div className="mt-4">
                <div className="text-lg font-extrabold text-zinc-100 group-hover:text-emerald-300 transition-colors">
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
              className="group bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6 text-center hover:border-emerald-500/50 hover:bg-emerald-500/[0.01] active:scale-[0.97] transition-all duration-300 cursor-pointer flex flex-col items-center justify-between min-h-[180px] shadow-lg shadow-black/10"
            >
              <div className="flex items-center justify-center gap-2 mt-2 text-zinc-400 group-hover:text-emerald-450 transition-colors">
                <Users className="size-6 transition-transform duration-300 group-hover:-translate-x-1" />
                <span className="text-xs font-semibold text-zinc-600">vs</span>
                <Users className="size-6 transition-transform duration-300 group-hover:translate-x-1" />
              </div>

              <div className="mt-4">
                <div className="text-lg font-extrabold text-zinc-100 group-hover:text-emerald-300 transition-colors">
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
          className="py-3 px-4 rounded-xl border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full"
        >
          <ArrowLeft className="size-3.5" />
          <span>Back to Court Selection</span>
        </button>
      </div>
    </div>
  );
}

