'use client';

import { CourtInfo } from '@/lib/queue';

interface CourtGridProps {
  courts: CourtInfo[];
  selectedCourtId?: string;
  onSelect: (court: CourtInfo) => void;
}

export function CourtGrid({ courts, selectedCourtId, onSelect }: CourtGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
      {courts.map((court) => (
        <button
          key={court.id}
          type="button"
          onClick={() => onSelect(court)}
          className={`p-3.5 sm:p-4 rounded-xl border text-left transition-all cursor-pointer ${
            selectedCourtId === court.id
              ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500 shadow-sm'
              : 'border-border bg-card hover:border-primary/50 text-foreground shadow-xs'
          }`}
        >
          <div className="text-base sm:text-lg font-bold text-foreground">{court.name}</div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <span className={`size-2 rounded-full ${court.status === 'Available' ? 'bg-emerald-500' : court.status === 'Playing' ? 'bg-amber-500' : 'bg-zinc-400'}`} />
            <span>{court.status}</span>
          </div>
        </button>
      ))}
    </div>
  );
}
