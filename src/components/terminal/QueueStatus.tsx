'use client';

interface Props {
  courtName: string;
  position: number;
  estimatedWait: string;
  duration: number;
  status: string;
  onCancel: () => void;
}

export function QueueStatus({ courtName, position, estimatedWait, duration, status, onCancel }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-6xl mb-4">⏳</div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">You&apos;re in Queue</h1>
      <p className="text-gray-500 mb-6">{courtName} &middot; {duration} min</p>

      <div className="bg-amber-50 rounded-2xl p-5 mb-2 text-center w-full max-w-xs">
        <p className="text-sm text-amber-600 font-medium">Queue Position</p>
        <p className="text-5xl font-bold text-amber-700">{position}</p>
      </div>

      <p className="text-gray-500 mb-6">Est. wait: {estimatedWait}</p>

      <p className="text-xs text-gray-400 mb-6">You will be notified when a court is ready</p>

      <button onClick={onCancel}
        className="w-full max-w-xs py-4 bg-red-50 text-red-600 rounded-2xl text-lg font-semibold active:bg-red-100 cursor-pointer"
      >
        Cancel Queue
      </button>
    </div>
  );
}
