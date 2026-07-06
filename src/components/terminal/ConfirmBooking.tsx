interface Props {
  courtName: string;
  gameType: string;
  duration: number;
  creditsRequired: number;
  balance: number;
  onConfirm: () => void;
  onBack: () => void;
  busy: boolean;
}

export function ConfirmBooking({ courtName, gameType, duration, creditsRequired, balance, onConfirm, onBack, busy }: Props) {
  const sufficient = balance >= creditsRequired;
  return (
    <div className="flex-1 flex flex-col p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Confirm Booking</h1>
      <div className="flex-1 space-y-3">
        <SummaryRow label="Court" value={courtName} />
        <SummaryRow label="Game Type" value={gameType} />
        <SummaryRow label="Duration" value={`${duration} min`} />
        {!sufficient && (
          <div className="bg-red-50 rounded-xl p-4 text-center">
            <p className="text-red-600 font-semibold">Insufficient Credits</p>
            <p className="text-sm text-red-500">Need ₱{creditsRequired}, have ₱{balance}</p>
          </div>
        )}
      </div>
      <div className="bg-blue-50 rounded-xl p-4 mb-4 text-center">
        <p className="text-xs text-blue-600">Credits Required</p>
        <p className="text-3xl font-bold text-blue-700">₱{creditsRequired}</p>
        <p className="text-xs text-blue-500">Balance: ₱{balance.toLocaleString()}</p>
      </div>
      <div className="flex gap-3">
        <button onClick={onBack} className="flex-1 py-4 bg-gray-100 rounded-2xl text-lg font-medium cursor-pointer active:bg-gray-200">
          Back
        </button>
        <button onClick={onConfirm} disabled={busy || !sufficient}
          className="flex-1 py-4 bg-green-600 text-white rounded-2xl text-lg font-bold disabled:opacity-40 cursor-pointer active:bg-green-700 disabled:cursor-default"
        >
          {busy ? 'Joining...' : 'Join Queue'}
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-xl p-4 flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-lg font-bold">{value}</span>
    </div>
  );
}
