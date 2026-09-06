import { BookingStepper } from './BookingStepper';
import { Sparkles, Check, Users, Calendar, Wrench, Ban, ArrowLeft } from 'lucide-react';

interface CourtOption {
  id: string;
  name: string;
  status: string;
  estimatedWait?: string;
}

interface Props {
  member?: any;
  courts: CourtOption[];
  onSelect: (court: CourtOption) => void;
  onBack: () => void;
}

interface StatusConfig {
  badge: string;
  badgeText: string;
  label: string;
  selectable: boolean;
  icon: React.ComponentType<{ className?: string }>;
  themeClass: string; // Tailwind border/bg colors
}

const STATUS_STYLES: Record<string, StatusConfig> = {
  Available: {
    badge: 'bg-[#32A45E]/15 text-[#72d493] border border-[#32A45E]/35',
    badgeText: 'Available',
    label: 'Book now & start immediately',
    selectable: true,
    icon: Check,
    themeClass: 'border-[#40584a] bg-[#203229] hover:border-[#32A45E]/60 hover:bg-[#294335] hover:shadow-[0_0_20px_rgba(50,164,94,0.12)]'
  },
  Playing: {
    badge: 'bg-[#d9a441]/15 text-[#e2b85a] border border-[#d9a441]/35',
    badgeText: 'In Game',
    label: 'Tap to queue up next',
    selectable: true,
    icon: Users,
    themeClass: 'border-[#40584a] bg-[#1c2d25] hover:border-[#d9a441]/55 hover:bg-[#3a3220] hover:shadow-[0_0_20px_rgba(217,164,65,0.1)]'
  },
  Reserved: {
    badge: 'bg-[#0E5E9A]/20 text-[#71b5e2] border border-[#0E5E9A]/40',
    badgeText: 'Reserved',
    label: 'Tap to queue up next',
    selectable: true,
    icon: Calendar,
    themeClass: 'border-[#40584a] bg-[#1c2d25] hover:border-[#0E5E9A]/55 hover:bg-[#203746] hover:shadow-[0_0_20px_rgba(14,94,154,0.1)]'
  },
  Maintenance: {
    badge: 'bg-[#e66a6a]/10 text-[#ff9b9b] border border-[#e66a6a]/30',
    badgeText: 'Maintenance',
    label: 'Court temporarily offline',
    selectable: false,
    icon: Wrench,
    themeClass: 'border-[#2b4035] bg-[#17231d] opacity-40 cursor-not-allowed'
  },
  Closed: {
    badge: 'bg-[#718178]/15 text-[#829188] border border-[#718178]/25',
    badgeText: 'Closed',
    label: 'Court is closed',
    selectable: false,
    icon: Ban,
    themeClass: 'border-[#2b4035] bg-[#17231d] opacity-40 cursor-not-allowed'
  },
};

export function SelectCourt({ member, courts, onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col h-full">
      <BookingStepper
        current={0}
        memberName={member ? `${member.firstName} ${member.lastName}` : undefined}
        balance={member?.balance}
        onCancel={onBack}
      />

      <div className="flex-1 flex flex-col px-5 pb-5 justify-between gap-4 overflow-y-auto">
        <div className="space-y-3">
          <div className="px-1"><div className="text-xl font-black tracking-tight text-[#f3f6f2]">Where do you want to play?</div><div className="mt-1 text-xs text-[#9eaca3]">Choose an available court to continue.</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            {/* Any Court option */}
            <button
              onClick={() => onSelect({ id: '', name: 'Any Court', status: 'Available' })}
              className="group relative min-h-[132px] rounded-2xl p-5 text-left border-2 border-dashed border-[#32A45E]/45 bg-[#20362a] hover:border-[#32A45E]/80 hover:bg-[#294335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] active:scale-[0.98] transition-all duration-300 cursor-pointer shadow-md shadow-black/10"
            >
              <div className="absolute top-4 right-4 text-secondary/60 group-hover:text-secondary transition-colors">
                <Sparkles className="size-5 animate-pulse" />
              </div>
              
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base font-extrabold text-[#FCFCF6] group-hover:text-[#72d493] transition-colors">Any Court</span>
                      <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#32A45E]/15 text-[#72d493] border border-[#32A45E]/30 tracking-wider uppercase">
                      Auto
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">System picks first available court</span>
                </div>
                <div className="text-[10px] text-secondary font-semibold mt-3 flex items-center gap-1">
                  <span>⚡</span> Recommended for fastest play
                </div>
              </div>
            </button>

            {courts.map(c => {
              const style = STATUS_STYLES[c.status] ?? STATUS_STYLES.Closed;
              const unavailable = !style.selectable;
              const StatusIcon = style.icon;
              
              return (
                <button
                  key={c.id}
                  onClick={() => !unavailable && onSelect(c)}
                  disabled={unavailable}
                  className={`group min-h-[132px] rounded-2xl p-5 text-left border transition-all duration-300 active:scale-[0.98] relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] ${style.themeClass}`}
                >
                  <div className="absolute top-4 right-4 text-zinc-600/40 group-hover:text-zinc-500 transition-colors">
                    <StatusIcon className="size-5" />
                  </div>

                  <div className="flex flex-col justify-between h-full">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-base font-extrabold text-zinc-100 group-hover:text-zinc-50 transition-colors">{c.name}</span>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full tracking-wider uppercase ${style.badge}`}>
                          {style.badgeText}
                        </span>
                      </div>
                      <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">{style.label}</span>
                    </div>

                    {c.status === 'Playing' && (
                      <div className="text-[10px] text-amber-500/90 font-semibold mt-3">
                        • Game in progress
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button 
          onClick={onBack} 
          className="py-3 px-4 rounded-xl border border-[#536a5c] text-xs font-bold uppercase tracking-wider text-[#d9e3dc] hover:text-[#FCFCF6] hover:bg-[#24372e] active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full mt-2"
        >
          <ArrowLeft className="size-3.5" />
          <span>Exit Wizard</span>
        </button>
      </div>
    </div>
  );
}
