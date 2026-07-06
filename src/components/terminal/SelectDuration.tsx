interface Props {
  onSelect: (duration: number) => void;
  onBack: () => void;
}

const RATES: Record<string, number> = { '30': 150, '60': 300, '90': 450 };

export function SelectDuration({ onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Duration</h1>
      <div className="grid grid-cols-3 gap-4 w-full max-w-md">
        {[30, 60, 90].map(d => {
          const total = RATES[String(d)] * (d / 30);
          return (
            <button key={d} onClick={() => onSelect(d)}
              className="bg-white border-2 border-gray-200 rounded-2xl p-6 text-center active:border-blue-500 cursor-pointer"
            >
              <div className="text-3xl font-bold">{d}</div>
              <div className="text-sm text-gray-500">min</div>
              <div className="text-lg font-semibold mt-2 text-blue-700">₱{total}</div>
            </button>
          );
        })}
      </div>
      <button onClick={onBack} className="mt-6 py-3 text-gray-500 text-lg underline cursor-pointer">
        Back
      </button>
    </div>
  );
}
