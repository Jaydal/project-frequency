interface Props {
  courtName: string;
  gameType: string;
  duration: number;
  creditsRequired: number;
  balance: number;
  matchTitle: string;
  onMatchTitleChange: (title: string) => void;
  onConfirm: () => void;
  onBack: () => void;
  busy: boolean;
}

export function ConfirmBooking({ courtName, gameType, duration, creditsRequired, balance, matchTitle, onMatchTitleChange, onConfirm, onBack, busy }: Props) {
  const sufficient = balance >= creditsRequired;
  return (
    <div className="flex-1 flex flex-col p-6 gap-3">
      <h1 className="text-lg font-semibold text-zinc-100">Confirm Booking</h1>
      <div className="flex-1 space-y-2">
        <Row label="Court" value={courtName} />
        <Row label="Game Type" value={gameType} />
        <Row label="Duration" value={`${duration} min`} />
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Match Title (optional)</label>
          <input type="text" value={matchTitle} onChange={e => onMatchTitleChange(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
            placeholder="e.g. Doubles A vs B"
          />
        </div>
        {!sufficient && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-center">
            <p className="text-red-400 font-medium">Insufficient Credits</p>
            <p className="text-xs text-red-400">Need ₱{creditsRequired}, have ₱{balance}</p>
          </div>
        )}
      </div>
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-center">
        <p className="text-xs text-zinc-500">Credits Required</p>
        <p className="text-xl font-bold text-zinc-100">₱{creditsRequired}</p>
        <p className="text-xs text-zinc-500">Balance: ₱{balance.toLocaleString()}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onBack} className="flex-1 py-3 bg-zinc-800 rounded-lg text-sm font-medium cursor-pointer text-zinc-300 hover:bg-zinc-700">
          Back
        </button>
        <button onClick={onConfirm} disabled={busy || !sufficient}
          className="flex-1 py-3 bg-emerald-500 text-black rounded-lg text-sm font-semibold disabled:opacity-40 cursor-pointer hover:bg-emerald-400 disabled:cursor-default"
        >
          {busy ? 'Joining...' : 'Join Queue'}
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 flex justify-between items-center">
      <span className="text-xs text-zinc-500">{label}</span>
      <span className="text-sm font-semibold text-zinc-100">{value}</span>
    </div>
  );
}
