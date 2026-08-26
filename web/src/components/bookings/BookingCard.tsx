'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Booking {
  id: string;
  status: string;
  start_time: string;
  duration: number;
  courts?: { name: string };
}

interface BookingCardProps {
  booking: Booking;
  onCancel: () => void;
}

export function BookingCard({ booking, onCancel }: BookingCardProps) {
  const start = new Date(booking.start_time);
  const canCancel = new Date().getTime() < start.getTime() - 2 * 60 * 60 * 1000;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{booking.courts?.name ?? 'Court'}</span>
          <span className="text-sm text-emerald-400">{booking.status}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-white/70">{start.toLocaleString()}</p>
        <p className="text-sm text-white/70">{booking.duration} min</p>
        {canCancel && <Button variant="destructive" onClick={onCancel}>Cancel Booking</Button>}
      </CardContent>
    </Card>
  );
}
