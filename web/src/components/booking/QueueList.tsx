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
  estimatedStartTime: number;
  bookedAt: number;
}

interface Props {
  entries: QueueEntryDisplay[];
}

export function QueueList({ entries }: Props) {
  if (entries.length === 0) {
    return <p className="text-zinc-500 text-xs">No one waiting</p>;
  }

  const formatTime = (ms: number) => 
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: 'numeric', hour12: true }).format(new Date(ms));

  return (
    <div>
      <div className="grid grid-cols-[1.4rem_minmax(0,1.5fr)_minmax(4rem,0.8fr)_minmax(4.5rem,0.9fr)] items-center gap-2 px-3 py-1.5 text-[10px] text-zinc-600 uppercase tracking-wider">
        <span />
        <span>Player / Match</span>
        <span>Court / Time</span>
        <span className="text-right">Schedule / Wait</span>
      </div>
      <div className="space-y-1">
        {entries.map((e) => {
          const start = e.estimatedStartTime;
          const end = start + e.duration * 60_000;
          return (
            <div
              key={e.id}
              className="grid grid-cols-[1.4rem_minmax(0,1.5fr)_minmax(4rem,0.8fr)_minmax(4.5rem,0.9fr)] items-center gap-2 bg-zinc-800 rounded px-3 py-2"
            >
              <span className={`size-6 rounded-full flex items-center justify-center text-[10px] font-medium shrink-0 ${
                e.position === 1 ? 'bg-secondary/20 text-secondary' : 'bg-zinc-700 text-zinc-400'
              }`}>
                {e.position}
              </span>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[11px] text-zinc-100">{e.firstName} {e.lastName}</span>
                  <span className="shrink-0 rounded bg-zinc-700 px-1 py-0.5 text-[10px] font-medium text-zinc-300">{e.matchType}</span>
                </div>
                {e.matchTitle && <span className="block truncate text-[10px] text-zinc-400">{e.matchTitle}</span>}
              </div>
              <div className="min-w-0 text-[11px] text-zinc-500">
                <span className="block truncate">{e.courtName || 'Any'}</span>
                <span className="block truncate">{formatTime(e.bookedAt)} · {e.duration}m</span>
              </div>
              <div className="min-w-0 text-right text-[11px]">
                <span className="block truncate font-mono tracking-tight text-secondary/80">{formatTime(start)} - {formatTime(end)}</span>
                <span className="block truncate text-zinc-400">{e.estimatedWait}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
