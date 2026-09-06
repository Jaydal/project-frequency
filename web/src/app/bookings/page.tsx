'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Booking {
  id: string;
  status: string;
  start_time: string;
  duration: number;
  courts?: { name: string };
}

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login?redirect=/bookings');
        return;
      }
      const now = new Date().toISOString();
      supabase.from('games').select('*, courts(name), game_players(*)').eq('status', 'Scheduled').gte('start_time', now).order('start_time', { ascending: true }).then(({ data }) => {
        const myBookings = (data ?? []).filter((g: any) => g.game_players?.some((p: any) => p.member_id === user.id));
        setBookings(myBookings);
        setLoading(false);
      });
    });
  }, [router]);

  async function handleCancel(id: string) {
    const supabase = createClient();
    await supabase.from('games').update({ status: 'Cancelled' }).eq('id', id);
    setBookings(bookings.filter(b => b.id !== id));
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-4">
      <h1 className="text-3xl font-bold">My Bookings</h1>
      {loading && <p className="text-white/60">Loading...</p>}
      {!loading && bookings.length === 0 && <p className="text-white/60">No upcoming bookings.</p>}
      {bookings.map((b) => (
        <Card key={b.id}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{b.courts?.name ?? 'Court'}</span>
              <span className="text-sm text-emerald-400">{b.status}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-white/70">{new Date(b.start_time).toLocaleString()}</p>
            <p className="text-sm text-white/70">{b.duration} min</p>
            {new Date().getTime() < new Date(b.start_time).getTime() - 2 * 60 * 60 * 1000 && (
              <Button variant="destructive" onClick={() => handleCancel(b.id)}>Cancel Booking</Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
