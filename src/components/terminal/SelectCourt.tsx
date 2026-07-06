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
  Available: { bg: 'bg-green-100', text: 'text-green-700', label: 'Available' },
  Playing: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Playing' },
  Reserved: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Reserved' },
  Maintenance: { bg: 'bg-red-100', text: 'text-red-700', label: 'Maintenance' },
  Closed: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Closed' },
};

export function SelectCourt({ courts, onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col p-4">
      <h1 className="text-2xl font-bold text-gray-800 mb-3">Select Court</h1>
      <div className="flex-1 grid grid-cols-2 gap-3 content-start">
        {courts.map(c => {
          const style = STATUS_STYLES[c.status] ?? STATUS_STYLES.Closed;
          const disabled = c.status !== 'Available';
          return (
            <button key={c.id} onClick={() => onSelect(c)} disabled={disabled}
              className={`rounded-2xl p-4 text-left border-2 transition-all min-h-[80px] flex flex-col justify-between cursor-pointer
                ${disabled ? 'opacity-50 border-gray-200 bg-gray-50 cursor-not-allowed' : 'border-gray-200 bg-white active:border-blue-500'}`}
            >
              <div className="font-bold text-lg">{c.name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${style.bg} ${style.text}`}>
                  {style.label}
                </span>
                {c.estimatedWait && <span className="text-xs text-gray-400">{c.estimatedWait}</span>}
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={onBack} className="mt-3 py-3 text-gray-500 text-lg underline cursor-pointer">
        Cancel
      </button>
    </div>
  );
}
