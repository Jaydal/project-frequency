import { BookingStepper } from './BookingStepper';
import { CreditCard, Award, Clock, ArrowLeft, Check, AlertCircle } from 'lucide-react';

interface Props {
  member?: any;
  courtName: string;
  gameType: string;
  duration: number;
  creditsRequired: number;
  balance: number;
  matchTitle: string;
  onMatchTitleChange: (title: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  onCancel?: () => void;
  busy: boolean;
  scheduledStart?: string;
}

export function ConfirmBooking({
  member, courtName, gameType, duration, creditsRequired, balance,
  matchTitle, onMatchTitleChange, onConfirm, onBack, onCancel, busy, scheduledStart
}: Props) {
  const sufficient = balance >= creditsRequired;
  const remaining = balance - creditsRequired;

  return (
    <div className="flex-1 flex flex-col h-full">
      <BookingStepper
        current={3}
        memberName={member ? `${member.firstName} ${member.lastName}` : undefined}
        balance={member?.balance}
        onCancel={onCancel}
      />

      <div className="flex-1 flex flex-col px-5 pb-5 justify-between gap-4 overflow-y-auto">
        <div className="space-y-4">
          <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest px-1">
            Review Booking Details
          </div>

          {/* Ticket summary cards */}
          <div className="grid grid-cols-2 gap-2.5">
            {scheduledStart && (
              <SummaryCard icon={Clock} label="Time" value={new Date(scheduledStart).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} />
            )}
            <SummaryCard icon={Award} label="Court" value={courtName} />
            <SummaryCard icon={Award} label="Format" value={gameType === '2v2' ? 'Doubles' : 'Singles'} />
            <SummaryCard icon={Clock} label="Duration" value={`${duration} mins`} />
          </div>

          {/* Cost breakdown receipt */}
          <div className={`rounded-2xl border p-4 transition-all duration-300 shadow-md ${
            sufficient 
              ? 'border-[#32A45E]/35 bg-[#20362a] shadow-black/10'
              : 'border-[#e66a6a]/30 bg-[#2c2222] shadow-black/10'
          }`}>
            <div className="flex items-center justify-between mb-3.5 pb-2 border-b border-zinc-800/80">
              <div className="flex items-center gap-2 text-zinc-300">
                <CreditCard className="size-4 text-zinc-500" />
                <span className="text-xs font-bold uppercase tracking-wider">Payment Receipt</span>
              </div>
              {!sufficient ? (
                <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 flex items-center gap-1">
                  <AlertCircle className="size-3" /> Insufficient Credits
                </span>
              ) : (
                <span className="text-[9px] font-bold text-[#72d493] bg-[#32A45E]/15 px-2.5 py-1 rounded-full border border-[#32A45E]/30 flex items-center gap-1">
                  <Check className="size-3" /> Ready
                </span>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-zinc-400">
                <span>Account Balance</span>
                <span className="text-[#FCFCF6]">₱{balance.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs font-medium text-zinc-400">
                <span>Booking Cost</span>
                <span className="text-red-400 font-semibold">−₱{creditsRequired.toLocaleString()}</span>
              </div>
              <div className="h-px bg-zinc-800/80 my-2" />
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-zinc-300">Balance After Booking</span>
                <span className={`font-black text-base tracking-tight ${sufficient ? 'text-[#72d493]' : 'text-[#ff9b9b]'}`}>
                  ₱{remaining.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          {/* Match title input */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 block px-1">
              Match Title <span className="text-zinc-400 font-normal">(Optional)</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={matchTitle}
                onChange={e => onMatchTitleChange(e.target.value)}
                className="w-full bg-[#15231d] border border-[#40584a] rounded-xl pl-3.5 pr-10 py-3 text-sm text-[#FCFCF6] placeholder-[#718178] focus:outline-none focus:border-[#0E5E9A] focus:bg-[#1b2a23] transition-all"
                placeholder="e.g. Weekend Showdown, Friendly singles..."
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-700 text-xs pointer-events-none select-none">
                ✍️
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={onBack}
            className="flex-1 py-3.5 bg-[#24372e] text-[#d9e3dc] border border-[#536a5c] rounded-xl text-xs font-bold uppercase tracking-wider hover:text-[#FCFCF6] hover:bg-[#2d4638] active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <ArrowLeft className="size-4" />
            <span>Back</span>
          </button>
          
          <button
            onClick={onConfirm}
            disabled={busy || !sufficient}
            className="flex-[2] py-3.5 bg-secondary text-white font-extrabold rounded-xl text-xs uppercase tracking-wider disabled:opacity-30 disabled:cursor-not-allowed hover:bg-secondary/90 active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-secondary/10 hover:shadow-secondary/20 flex items-center justify-center gap-2"
          >
            {busy ? (
              <>
                <div className="size-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>Confirm & Book Match</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="bg-[#1b2a23] border border-[#2b4035] rounded-xl p-3.5 flex flex-col justify-between items-center text-center shadow-sm">
      <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-1.5">{label}</span>
      <span className="text-xs font-black text-[#FCFCF6] truncate w-full tracking-wide">{value}</span>
    </div>
  );
}
