interface Props {
  onSelect: (gameType: '1v1' | '2v2') => void;
  onBack: () => void;
}

export function SelectGameType({ onSelect, onBack }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Game Type</h1>
      <div className="grid grid-cols-2 gap-4 w-full max-w-md">
        <button onClick={() => onSelect('1v1')}
          className="bg-white border-2 border-gray-200 rounded-2xl p-8 text-center active:border-blue-500 cursor-pointer"
        >
          <div className="text-5xl mb-2">1</div>
          <div className="text-sm text-gray-500">vs</div>
          <div className="text-5xl mb-2">1</div>
          <div className="text-sm font-medium text-gray-600">Singles</div>
        </button>
        <button onClick={() => onSelect('2v2')}
          className="bg-white border-2 border-gray-200 rounded-2xl p-8 text-center active:border-blue-500 cursor-pointer"
        >
          <div className="text-5xl mb-2">2</div>
          <div className="text-sm text-gray-500">vs</div>
          <div className="text-5xl mb-2">2</div>
          <div className="text-sm font-medium text-gray-600">Doubles</div>
        </button>
      </div>
      <button onClick={onBack} className="mt-6 py-3 text-gray-500 text-lg underline cursor-pointer">
        Back
      </button>
    </div>
  );
}
