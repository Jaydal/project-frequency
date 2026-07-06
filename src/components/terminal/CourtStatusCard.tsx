export interface CourtStatusData {
  id: string;
  name: string;
  status: string;
  matchType?: string;
  elapsed?: number;
  duration?: number;
  players?: Array<{ first_name: string; last_name: string }>;
}

interface Props {
  court: CourtStatusData;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function CourtStatusCard({ court }: Props) {
  const isActive = court.status === 'In Progress';

  return (
    <div className={`rounded-xl p-4 border-l-8 ${
      isActive
        ? 'bg-white border-l-green-500 shadow-sm'
        : court.status === 'Scheduled'
        ? 'bg-white border-l-yellow-500 shadow-sm'
        : 'bg-gray-50 border-l-gray-300'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-bold">{court.name}</h3>
        {!isActive && court.status !== 'Scheduled' && (
          <span className="text-sm font-semibold text-green-700 bg-green-100 px-3 py-1 rounded-full">
            Available
          </span>
        )}
      </div>

      {isActive && court.elapsed !== undefined && court.duration && (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-mono font-bold text-green-700">
              {formatTime(court.elapsed)}
            </span>
            <span className="text-xs text-gray-400">
              {formatTime(Math.max(0, court.duration * 60 - court.elapsed))} left
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="h-2 rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min((court.elapsed / (court.duration * 60)) * 100, 100)}%` }}
            />
          </div>
          {court.players && court.players.length > 0 && (
            <div className="text-xs text-gray-600 space-y-0.5">
              {court.players.slice(0, 2).map((p, i) => (
                <span key={i} className="mr-2">
                  {p.first_name} {p.last_name}
                </span>
              ))}
              {court.players.length > 2 && (
                <span className="text-gray-400">+{court.players.length - 2}</span>
              )}
            </div>
          )}
        </>
      )}

      {isActive && court.matchType && (
        <div className="text-xs text-gray-400 mt-1">{court.matchType}</div>
      )}
    </div>
  );
}
