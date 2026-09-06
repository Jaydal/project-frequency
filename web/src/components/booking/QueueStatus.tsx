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
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#17231c] text-[#FCFCF6]">
      <div className="text-6xl mb-4">⏳</div>
      <h1 className="text-2xl font-bold text-[#FCFCF6] mb-2">You&apos;re in Queue</h1>
      <p className="text-[#c1cec5] mb-6">{courtName} &middot; {duration} min</p>

      <div className="bg-[#20362a] border border-[#32A45E]/35 rounded-2xl p-5 mb-2 text-center w-full max-w-xs shadow-lg shadow-black/10">
        <p className="text-sm text-[#72d493] font-medium">Queue Position</p>
        <p className="text-5xl font-bold text-[#FCFCF6]">{position}</p>
      </div>

      <p className="text-[#c1cec5] mb-6">Est. wait: {estimatedWait}</p>

      <p className="text-xs text-[#aebbb2] mb-6">You will be notified when a court is ready</p>

      <button onClick={onCancel}
        className="w-full max-w-xs py-4 bg-[#352323] border border-[#e66a6a]/45 text-[#ffb0b0] rounded-2xl text-lg font-semibold active:bg-[#4b2b2b] cursor-pointer"
      >
        Cancel Queue
      </button>
    </div>
  );
}
