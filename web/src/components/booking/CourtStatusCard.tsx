import { memo, useState, useEffect } from 'react';


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
  start_time?: string;
  nextMatchTitle?: string;
  nextStartTime?: string;
  nextPlayers?: Array<{ first_name: string; last_name: string }>;
}

interface Props {
  court: CourtStatusData;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// A court is active purely from its schedule: a game whose window
// (start_time + duration) has not yet ended.
export function isActiveNow(court: CourtStatusData, nowMs = Date.now()): boolean {
  if (!court.start_time) return false;
  const start = new Date(court.start_time).getTime();
  const end = start + (court.duration ?? 0) * 60_000;
  return nowMs >= start && nowMs < end;
}

export const CourtStatusCard = memo(function CourtStatusCard({ court }: Props) {
  const [now, setNow] = useState(Date.now());

  const isActive = isActiveNow(court, now);

  useEffect(() => {
    if (!court.start_time) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [court.start_time]);

  const elapsed = court.start_time ? Math.floor((now - new Date(court.start_time).getTime()) / 1000) : 0;
  const totalSec = court.duration ? court.duration * 60 : 0;
  const remain = isActive ? Math.max(0, totalSec - elapsed) : 0;

  return (
      <div className={`booking-court-card relative min-h-[150px] overflow-hidden rounded-xl p-4 border border-white/[0.06] border-l-4 shadow-[0_8px_24px_rgba(0,0,0,0.18)] ${
      isActive
        ? 'bg-[linear-gradient(135deg,#203b31_0%,#1c3029_52%,#142b3a_100%)] border-l-[#32A45E]'
        : 'bg-[linear-gradient(135deg,#1b2a23_0%,#192722_58%,#172631_100%)] border-l-[#536a5c]'
    }`}>
      <img src="/brand/pp-submark.svg" alt="" aria-hidden="true" className="pointer-events-none absolute -right-8 -bottom-12 z-0 h-52 w-52 opacity-[0.09]" />
      <div className="relative z-10">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-[var(--booking-text)]">{court.name}</h3>
        {isActive && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#32A45E]/15 text-[#72d493] border border-[#32A45E]/25">
            {'In Game'}
          </span>
        )}
        {!isActive && court.status !== 'Scheduled' && (
          <span className="text-xs font-medium text-[#72d493] bg-[#32A45E]/10 px-2 py-0.5 rounded">
            Available
          </span>
        )}
        {!isActive && court.status === 'Scheduled' && court.start_time && (
          <span className="text-xs font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
            Scheduled · {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(court.start_time))}
          </span>
        )}
      </div>

      {court.matchTitle && (
        <div className="text-xs text-[var(--booking-muted)] mb-1.5">{court.matchTitle}</div>
      )}

      {court.nextStartTime && (
        <div className="mt-2 min-h-[42px] rounded-lg border border-[var(--booking-border)] bg-[var(--booking-inset)] px-2.5 py-1.5 text-[11px] text-[var(--booking-muted)]">
          <div className="font-medium text-[var(--booking-text)]">Up next · {court.nextMatchTitle || 'Scheduled game'}</div>
          <div>{new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(court.nextStartTime))}
            {court.nextPlayers && court.nextPlayers.length > 0 && ` · ${court.nextPlayers.slice(0, 2).map((p) => `${p.first_name} ${p.last_name}`).join(' / ')}`}
          </div>
        </div>
      )}

      {!isActive && court.status === 'Scheduled' && court.duration && court.start_time && (
        <div className="text-[11px] text-[var(--booking-subtle)]">
          {court.duration} min · ends {new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(new Date(court.start_time).getTime() + court.duration * 60_000))}
        </div>
      )}

      {!isActive && court.status === 'Scheduled' && court.players && court.players.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mt-2">
          {court.players.slice(0, 2).map((p, i) => (
            <span key={i} className="text-xs bg-[var(--booking-panel)] text-[var(--booking-text)] border border-[var(--booking-border)]/60 px-2 py-0.5 rounded-md font-medium">
              {p.first_name} {p.last_name}
            </span>
          ))}
          {court.players.length > 2 && <span className="text-xs text-[var(--booking-subtle)]">+{court.players.length - 2}</span>}
        </div>
      )}

      {isActive && court.duration && (
        <>
          <div className="flex flex-col items-center py-2">
            <div className="relative overflow-hidden rounded-xl px-5 py-3 bg-[radial-gradient(circle_at_50%_35%,rgba(14,94,154,0.32),rgba(14,45,70,0.2)_58%,rgba(16,23,19,0.08))] border border-[#0E5E9A]/45 shadow-[0_8px_24px_rgba(14,94,154,0.16),inset_0_1px_0_rgba(255,255,255,0.06)]">
              <span className="relative z-10 text-5xl font-mono font-black tracking-wider tabular-nums text-[#6db1dc]">
                {formatTime(remain)}
                <span className="text-2xl font-medium opacity-40 ml-1">LEFT</span>
              </span>
            </div>
            <div className="flex flex-col items-center mt-2 text-[11px] text-[var(--booking-subtle)] tabular-nums">
              <span>Elapsed {formatTime(elapsed)}</span>
              <span>Started {court.start_time && new Intl.DateTimeFormat('en-US', {
                dateStyle: 'medium', timeStyle: 'short', hour12: true,
              }).format(new Date(court.start_time))}</span>
            </div>
          </div>
          {court.players && court.players.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mt-2">
              {court.players.slice(0, 2).map((p, i) => (
                <span key={i} className="text-xs bg-[var(--booking-panel)] text-[var(--booking-text)] border border-[var(--booking-border)]/60 px-2 py-0.5 rounded-md font-medium">
                  {p.first_name} {p.last_name}
                </span>
              ))}
              {court.players.length > 2 && (
                <span className="text-xs text-[var(--booking-subtle)]">+{court.players.length - 2}</span>
              )}
            </div>
          )}
        </>
      )}

      {isActive && court.matchType && (
        <div className="text-xs text-zinc-500 mt-1">{court.matchType}</div>
      )}
      </div>
    </div>
  );
});
