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
    <div className="max-w-xl mx-auto py-12 px-4">
      <Card className="border-border bg-card shadow-lg">
        <CardHeader className="text-center pb-2">
          <div className="mx-auto size-12 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 mb-2">
            ✓
          </div>
          <CardTitle className="text-xl font-black text-foreground">Booking Confirmed</CardTitle>
          <p className="text-xs text-muted-foreground">Your court has been successfully scheduled.</p>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          <div className="rounded-xl border border-border bg-muted/40 p-4 space-y-2.5 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Booking ID</span>
              <span className="font-mono font-bold text-foreground text-xs">{booking.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Court</span>
              <span className="font-bold text-foreground">{courtName ?? booking.court_id ?? 'TBD'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scheduled Time</span>
              <span className="font-medium text-foreground">{start.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Duration</span>
              <span className="font-medium text-foreground">{booking.duration} minutes</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t border-border/60">
              <span className="text-muted-foreground">Status</span>
              <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">{booking.status}</span>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
            <Button onClick={() => window.location.href = '/bookings'} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold">
              View My Bookings
            </Button>
            <Button variant="outline" onClick={() => window.location.href = '/book'} className="flex-1 border-border hover:bg-muted text-foreground">
              Book Another Court
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
