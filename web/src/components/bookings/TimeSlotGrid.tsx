'use client';

interface Slot {
  time: string;
  available: boolean;
}

interface TimeSlotGridProps {
  slots: Slot[];
  selectedTime?: string;
  onSelect: (time: string) => void;
}

export function TimeSlotGrid({ slots, selectedTime, onSelect }: TimeSlotGridProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
      {slots.map((slot) => (
        <button
          key={slot.time}
          type="button"
          disabled={!slot.available}
          onClick={() => onSelect(slot.time)}
          className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            selectedTime === slot.time
              ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-500'
              : slot.available
                ? 'bg-muted/70 hover:bg-muted text-foreground border border-border/80 hover:border-primary/50'
                : 'bg-muted/30 text-muted-foreground/40 border border-transparent line-through cursor-not-allowed'
          }`}
        >
          {slot.time}
        </button>
      ))}
    </div>
  );
}
