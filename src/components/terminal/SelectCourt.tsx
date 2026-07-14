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
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20',
    badgeText: 'Available',
    label: 'Book now & start immediately',
    selectable: true,
    icon: Check,
    themeClass: 'border-zinc-800 bg-zinc-900/50 hover:border-emerald-500/50 hover:bg-emerald-500/[0.02] hover:shadow-[0_0_20px_rgba(16,185,129,0.06)]'
  },
  Playing: {
    badge: 'bg-amber-500/10 text-amber-455 border border-amber-500/20',
    badgeText: 'In Game',
    label: 'Tap to queue up next',
    selectable: true,
    icon: Users,
    themeClass: 'border-zinc-800 bg-zinc-900/30 hover:border-amber-500/40 hover:bg-amber-500/[0.02] hover:shadow-[0_0_20px_rgba(245,158,11,0.04)]'
  },
  Reserved: {
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    badgeText: 'Reserved',
    label: 'Tap to queue up next',
    selectable: true,
    icon: Calendar,
    themeClass: 'border-zinc-800 bg-zinc-900/30 hover:border-blue-500/40 hover:bg-blue-500/[0.02] hover:shadow-[0_0_20px_rgba(59,130,246,0.04)]'
  },
  Maintenance: {
    badge: 'bg-red-500/10 text-red-400 border border-red-500/20',
    badgeText: 'Maintenance',
    label: 'Court temporarily offline',
    selectable: false,
    icon: Wrench,
    themeClass: 'border-zinc-900 bg-zinc-950/20 opacity-30 cursor-not-allowed'
  },
  Closed: {
    badge: 'bg-zinc-800/40 text-zinc-500 border border-zinc-700/20',
    badgeText: 'Closed',
    label: 'Court is closed',
    selectable: false,
    icon: Ban,
    themeClass: 'border-zinc-900 bg-zinc-950/20 opacity-30 cursor-not-allowed'
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
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-1">
            Choose a Court
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
            {/* Any Court option */}
            <button
              onClick={() => onSelect({ id: '', name: 'Any Court', status: 'Available' })}
              className="group relative rounded-2xl p-5 text-left border-2 border-dashed border-emerald-500/35 bg-gradient-to-br from-emerald-950/20 via-zinc-900/50 to-zinc-950/30 hover:border-emerald-400/80 hover:from-emerald-950/30 active:scale-[0.98] transition-all duration-300 cursor-pointer shadow-md shadow-black/10"
            >
              <div className="absolute top-4 right-4 text-emerald-400/60 group-hover:text-emerald-400 transition-colors">
                <Sparkles className="size-5 animate-pulse" />
              </div>
              
              <div className="flex flex-col h-full justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base font-extrabold text-zinc-100 group-hover:text-emerald-300 transition-colors">Any Court</span>
                    <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 tracking-wider uppercase">
                      Auto
                    </span>
                  </div>
                  <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">System picks first available court</span>
                </div>
                <div className="text-[10px] text-emerald-500 font-semibold mt-3 flex items-center gap-1">
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
                  className={`group rounded-2xl p-5 text-left border transition-all duration-300 active:scale-[0.98] relative overflow-hidden ${style.themeClass}`}
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
          className="py-3 px-4 rounded-xl border border-zinc-800 text-xs font-bold uppercase tracking-wider text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2 w-full mt-2"
        >
          <ArrowLeft className="size-3.5" />
          <span>Exit Wizard</span>
        </button>
      </div>
    </div>
  );
}

