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
    <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
      {slots.map((slot) => (
        <button
          key={slot.time}
          disabled={!slot.available}
          onClick={() => onSelect(slot.time)}
          className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
            selectedTime === slot.time
              ? 'bg-emerald-500 text-white'
              : slot.available
                ? 'bg-white/10 hover:bg-white/20'
                : 'bg-white/5 text-white/30 line-through cursor-not-allowed'
          }`}
        >
          {slot.time}
        </button>
      ))}
    </div>
  );
}
