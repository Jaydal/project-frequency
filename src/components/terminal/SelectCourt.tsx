interface CourtOption {
  id: string;
  name: string;
  status: string;
  estimatedWait?: string;
}

interface Props {
  courts: CourtOption[];
  onSelect: (court: CourtOption) => void;
  onBack: () => void;
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  Available: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Available' },
  Playing: { bg: 'bg-zinc-700', text: 'text-zinc-400', label: 'In use' },
  Reserved: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Reserved' },
  Maintenance: { bg: 'bg-red-500/10', text: 'text-red-400', label: 'Unavailable' },
  Closed: { bg: 'bg-zinc-700', text: 'text-zinc-500', label: 'Closed' },
};

export function SelectCourt({ courts, onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col p-4 gap-4">
      <h1 className="text-lg font-semibold text-zinc-100">Select Court</h1>
      <div className="flex-1 grid grid-cols-2 gap-2 content-start">
        <button onClick={() => onSelect({ id: '', name: 'Any Court', status: 'Available' })}
          className="rounded-lg p-4 text-left border border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-400 active:border-emerald-300 transition-all min-h-[72px] flex flex-col justify-between cursor-pointer"
        >
          <span className="font-semibold text-zinc-100">Any Court</span>
          <span className="text-xs font-medium mt-1 px-2 py-0.5 rounded self-start bg-emerald-500/10 text-emerald-400">
            First available
          </span>
        </button>
        {courts.map(c => {
          const style = STATUS_STYLES[c.status] ?? STATUS_STYLES.Closed;
          const busy = c.status !== 'Available';
          return (
            <button key={c.id} onClick={() => !busy && onSelect(c)}
              disabled={busy}
              className={`rounded-lg p-4 text-left border transition-all min-h-[72px] flex flex-col justify-between cursor-pointer ${
                busy
                  ? 'border-zinc-800 bg-zinc-900/50 opacity-50 cursor-not-allowed'
                  : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500 active:border-zinc-400'
              }`}
            >
              <span className="font-semibold text-zinc-100">{c.name}</span>
              <span className={`text-xs font-medium mt-1 px-2 py-0.5 rounded self-start ${style.bg} ${style.text}`}>
                {busy ? 'In use' : style.label}
              </span>
            </button>
          );
        })}
      </div>
      <button onClick={onBack} className="py-3 text-sm text-zinc-500 hover:text-zinc-400 cursor-pointer">
        Cancel
      </button>
    </div>
  );
}
