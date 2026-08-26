'use client';

import { CourtInfo } from '@/lib/queue';

interface CourtGridProps {
  courts: CourtInfo[];
  selectedCourtId?: string;
  onSelect: (court: CourtInfo) => void;
}

export function CourtGrid({ courts, selectedCourtId, onSelect }: CourtGridProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {courts.map((court) => (
        <button
          key={court.id}
          onClick={() => onSelect(court)}
          className={`p-4 rounded-lg border-2 text-left transition-colors ${
            selectedCourtId === court.id ? 'border-emerald-500 bg-emerald-500/10' : 'border-white/10 hover:border-white/30'
          }`}
        >
          <div className="text-lg font-bold">{court.name}</div>
          <div className="text-sm text-white/60">{court.status}</div>
        </button>
      ))}
    </div>
  );
}
