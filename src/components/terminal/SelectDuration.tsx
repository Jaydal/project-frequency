interface Props {
  durations: number[];
  rates: Record<string, number>;
  onSelect: (duration: number) => void;
  onBack: () => void;
}

export function SelectDuration({ durations, rates, onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-lg font-semibold text-zinc-100">Duration</h1>
      <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
        {durations.map(d => {
          const per30 = rates[String(d)] ?? 0;
          const total = per30 * (d / 30);
          return (
            <button key={d} onClick={() => onSelect(d)}
              className="bg-zinc-900 border border-zinc-700 rounded-lg p-4 text-center hover:border-zinc-500 active:border-zinc-400 cursor-pointer"
            >
              <span className="text-xl font-bold text-zinc-100">{d}</span>
              <span className="block text-xs text-zinc-500">min</span>
              <span className="block text-sm font-semibold text-zinc-400 mt-1">₱{total}</span>
            </button>
          );
        })}
      </div>
      <button onClick={onBack} className="text-sm text-zinc-500 hover:text-zinc-400 cursor-pointer">Back</button>
    </div>
  );
}
