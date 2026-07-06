import { effectivePrepSec } from '@/lib/products-config-types';

export interface CourtStatusData {
  id: string;
  name: string;
  status: string;
  matchType?: string;
  matchTitle?: string;
  elapsed?: number;
  duration?: number;
  prepTimeSec?: number;
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

export function phaseForElapsed(elapsed: number, prepTimeSec: number): 'preparing' | 'in_game' {
  return elapsed < prepTimeSec ? 'preparing' : 'in_game';
}

export function CourtStatusCard({ court }: Props) {
  const rawPrepTime = court.prepTimeSec ?? 300;
  const prepTime = court.duration ? effectivePrepSec(court.duration, rawPrepTime) : rawPrepTime;
  const isActive = court.status === 'In Progress';
  const phase = court.elapsed !== undefined ? phaseForElapsed(court.elapsed, prepTime) : null;
  const totalSec = court.duration ? court.duration * 60 + prepTime : prepTime;
  const remain = court.elapsed !== undefined
    ? Math.max(0, totalSec - court.elapsed)
    : 0;

  return (
    <div className={`rounded-lg p-3 border-l-4 ${
      isActive
        ? phase === 'preparing'
          ? 'bg-zinc-900 border-l-amber-400'
          : 'bg-zinc-900 border-l-emerald-400'
        : 'bg-zinc-800/50 border-l-zinc-600'
    }`}>
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-zinc-100">{court.name}</h3>
        {isActive && phase && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded ${
            phase === 'preparing'
              ? 'bg-amber-500/10 text-amber-400'
              : 'bg-emerald-500/10 text-emerald-400'
          }`}>
            {phase === 'preparing' ? 'Preparing' : 'In Game'}
          </span>
        )}
        {!isActive && court.status !== 'Scheduled' && (
          <span className="text-xs font-medium text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded">
            Available
          </span>
        )}
      </div>

      {court.matchTitle && (
        <div className="text-xs text-zinc-400 mb-1.5">{court.matchTitle}</div>
      )}

      {isActive && court.elapsed !== undefined && court.duration && (
        <>
          <div className="flex flex-col items-center py-2">
            <div className={`rounded-xl px-4 py-3 ${phase === 'preparing' ? 'bg-amber-500/10' : 'bg-emerald-500/10'}`}>
              <span className={`text-5xl font-mono font-black tracking-wider tabular-nums ${
                phase === 'preparing' ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {formatTime(remain)}
                <span className="text-2xl font-medium opacity-40 ml-1">
                  {phase === 'preparing' ? 'PREP' : 'LEFT'}
                </span>
              </span>
            </div>
            <div className="flex gap-3 mt-2 text-[11px] text-zinc-500 tabular-nums">
              {phase === 'preparing' && (
                <>
                  <span>Game starts in {formatTime(Math.max(0, prepTime - court.elapsed))}</span>
                </>
              )}
              {phase === 'in_game' && (
                <>
                  <span>Elapsed {formatTime(court.elapsed)}</span>
                  <span className="text-zinc-600">|</span>
                  <span>Game {formatTime(court.elapsed - prepTime)}</span>
                </>
              )}
            </div>
          </div>
          {court.players && court.players.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {court.players.slice(0, 2).map((p, i) => (
                <span key={i} className="text-xs bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded">
                  {p.first_name} {p.last_name}
                </span>
              ))}
              {court.players.length > 2 && (
                <span className="text-xs text-zinc-500">+{court.players.length - 2}</span>
              )}
            </div>
          )}
        </>
      )}

      {isActive && court.matchType && phase === 'in_game' && (
        <div className="text-xs text-zinc-500 mt-0.5">{court.matchType}</div>
      )}
    </div>
  );
}
