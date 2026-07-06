export interface QueueEntryDisplay {
  id: string;
  position: number;
  firstName: string;
  lastName: string;
  matchType: string;
  matchTitle: string;
  courtName: string;
  duration: number;
  estimatedWait: string;
}

interface Props {
  entries: QueueEntryDisplay[];
}

export function QueueList({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-zinc-500 text-xs">No one waiting</p>;
  }

  return (
    <div>
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider">
        <span className="size-6 shrink-0" />
        <span className="w-20 shrink-0">Player</span>
        <span className="w-24 shrink-0">Match</span>
        <span className="w-14 shrink-0">Court</span>
        <span className="w-10 shrink-0 text-right">Time</span>
        <span className="w-16 text-right shrink-0">ETA</span>
      </div>
      <div className="space-y-1">
        {entries.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 bg-zinc-800 rounded px-3 py-2"
          >
            <span className={`size-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 ${
              e.position === 1 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-700 text-zinc-400'
            }`}>
              {e.position}
            </span>
            <span className="text-sm text-zinc-100 w-20 truncate shrink-0">
              {e.firstName} {e.lastName}
            </span>
            <span className="text-xs shrink-0 px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-300 font-medium mr-1.5">{e.matchType}</span>
            {e.matchTitle && <span className="text-xs text-zinc-400 truncate max-w-[80px]">{e.matchTitle}</span>}
            <span className="text-xs text-zinc-500 w-14 shrink-0">{e.courtName || 'Any'}</span>
            <span className="text-xs text-zinc-500 w-10 shrink-0 text-right">{e.duration}m</span>
            <span className="text-xs text-zinc-400 w-16 text-right shrink-0">{e.estimatedWait}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
