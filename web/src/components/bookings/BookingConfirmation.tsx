'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface BookingConfirmationProps {
  booking: {
    id: string;
    status: string;
    court_id: string | null;
    start_time: string;
    duration: number;
  };
  courtName?: string;
}

export function BookingConfirmation({ booking, courtName }: BookingConfirmationProps) {
  const start = new Date(booking.start_time);

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Booking Confirmed</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-sm text-white/70">Booking ID: {booking.id}</p>
          <p className="text-sm text-white/70">Court: {courtName ?? booking.court_id ?? 'TBD'}</p>
          <p className="text-sm text-white/70">{start.toLocaleString()}</p>
          <p className="text-sm text-white/70">{booking.duration} min</p>
          <p className="text-sm text-emerald-400">{booking.status}</p>
          <Button onClick={() => window.location.href = '/bookings'} className="w-full">View My Bookings</Button>
        </CardContent>
      </Card>
    </div>
  );
}
