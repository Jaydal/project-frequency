interface Props {
  onSelect: (gameType: '1v1' | '2v2') => void;
  onBack: () => void;
}

export function SelectGameType({ onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
      <h1 className="text-lg font-semibold text-zinc-100">Game Type</h1>
      <div className="grid grid-cols-2 gap-3 w-full max-w-sm">
        <button onClick={() => onSelect('1v1')}
          className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-500 active:border-zinc-400 cursor-pointer"
        >
          <span className="text-2xl font-bold text-zinc-100">1</span>
          <span className="block text-xs text-zinc-500 my-1">vs</span>
          <span className="text-2xl font-bold text-zinc-100">1</span>
          <span className="block text-xs text-zinc-400 mt-2">Singles</span>
        </button>
        <button onClick={() => onSelect('2v2')}
          className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 text-center hover:border-zinc-500 active:border-zinc-400 cursor-pointer"
        >
          <span className="text-2xl font-bold text-zinc-100">2</span>
          <span className="block text-xs text-zinc-500 my-1">vs</span>
          <span className="text-2xl font-bold text-zinc-100">2</span>
          <span className="block text-xs text-zinc-400 mt-2">Doubles</span>
        </button>
      </div>
      <button onClick={onBack} className="text-sm text-zinc-500 hover:text-zinc-400 cursor-pointer">Back</button>
    </div>
  );
}
