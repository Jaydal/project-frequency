interface Props {
  courtName: string;
  duration: number;
  creditsUsed: number;
  creditsRemaining: number;
}

export function BookingSuccess({ courtName, duration, creditsUsed, creditsRemaining }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-7xl mb-4">✅</div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Booking Confirmed</h1>
      <p className="text-xl text-gray-600 mb-1">{courtName}</p>
      <p className="text-sm text-gray-500 mb-6">{duration} min</p>

      <div className="bg-green-50 rounded-2xl p-5 mb-4 text-center w-full max-w-xs">
        <div className="flex justify-between mb-2">
          <span className="text-sm text-gray-600">Credits Used</span>
          <span className="text-lg font-bold text-red-600">-₱{creditsUsed}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-gray-600">Remaining</span>
          <span className="text-lg font-bold text-green-700">₱{creditsRemaining.toLocaleString()}</span>
        </div>
      </div>

      <p className="text-xs text-gray-400">Returning to start screen...</p>
    </div>
  );
}
