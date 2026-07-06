export interface QueueEntryDisplay {
  id: string;
  position: number;
  firstName: string;
  lastName: string;
  partySize: number;
  duration: number;
  estimatedWait: string;
}

interface Props {
  entries: QueueEntryDisplay[];
}

export function QueueList({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-400 text-lg">No one waiting</p>
      </div>
    );
  }

  return (
    <div className="space-y-1 overflow-y-auto max-h-[320px] pr-1">
      {entries.map((e) => (
        <div
          key={e.id}
          className="flex items-center gap-3 bg-white rounded-xl px-4 py-3 min-h-[48px]"
        >
          <div
            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
              e.position === 1
                ? 'bg-yellow-100 text-yellow-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {e.position}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-base">
              {e.firstName} {e.lastName.charAt(0)}.
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {e.partySize === 4 ? '2v2' : '1v1'}
            </span>
            <span className="text-xs text-gray-400">{e.duration}min</span>
            <span className="text-sm font-medium text-gray-600 w-16 text-right">
              {e.estimatedWait}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
