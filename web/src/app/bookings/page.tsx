'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Calendar, Clock, MapPin, Sun, Moon, AlertCircle, Trash2, Plus } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

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
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login?redirect=/bookings');
        return;
      }
      const now = new Date().toISOString();
      supabase
        .from('games')
        .select('*, courts(name), game_players(*)')
        .eq('status', 'Scheduled')
        .gte('start_time', now)
        .order('start_time', { ascending: true })
        .then(({ data }) => {
          const myBookings = (data ?? []).filter((g: any) =>
            g.game_players?.some((p: any) => p.member_id === user.id)
          );
          setBookings(myBookings);
          setLoading(false);
        });
    });
  }, [router]);

  async function handleCancel(id: string) {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    setCancellingId(id);
    try {
      const supabase = createClient();
      await supabase.from('games').update({ status: 'Cancelled' }).eq('id', id);
      setBookings((prev) => prev.filter((b) => b.id !== id));
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <img
              src="/brand/primary-logo.svg"
              alt="Paddle Point"
              className="h-8 sm:h-9 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/book"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted flex items-center gap-1"
            >
              <Plus size={14} />
              <span>Book Court</span>
            </Link>
            <Link
              href="/booking/queue"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              Live Queue
            </Link>
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto py-8 sm:py-12 px-4 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">My Bookings</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">View and manage your upcoming scheduled court reservations.</p>
          </div>
          <Button
            onClick={() => router.push('/book')}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold self-start sm:self-auto cursor-pointer"
          >
            <Plus size={16} className="mr-1.5" /> Book a Court
          </Button>
        </div>

        {loading && (
          <div className="p-8 text-center rounded-2xl border border-border bg-card">
            <p className="text-sm text-muted-foreground animate-pulse">Loading upcoming bookings...</p>
          </div>
        )}

        {!loading && bookings.length === 0 && (
          <div className="p-12 text-center rounded-2xl border border-dashed border-border bg-card space-y-4">
            <div className="mx-auto size-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
              <Calendar size={22} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">No upcoming bookings</h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs mx-auto">
                You do not have any scheduled reservations. Book a court ahead of time to secure your match!
              </p>
            </div>
            <Button onClick={() => router.push('/book')} className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold">
              Book Court Now
            </Button>
          </div>
        )}

        <div className="space-y-3">
          {bookings.map((b) => {
            const startDate = new Date(b.start_time);
            const canCancel = Date.now() < startDate.getTime() - 2 * 60 * 60 * 1000;

            return (
              <Card key={b.id} className="border-border bg-card shadow-xs">
                <CardHeader className="pb-3 border-b border-border/60">
                  <CardTitle className="flex items-center justify-between text-base">
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-emerald-500" />
                      <span className="font-bold text-foreground">{b.courts?.name ?? 'Court'}</span>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                      {b.status}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-muted-foreground" />
                      <span className="font-medium text-foreground">
                        {startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-muted-foreground" />
                      <span>
                        {startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({b.duration} minutes)
                      </span>
                    </div>
                  </div>

                  <div>
                    {canCancel ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={cancellingId === b.id}
                        onClick={() => handleCancel(b.id)}
                        className="text-xs font-bold cursor-pointer"
                      >
                        <Trash2 size={13} className="mr-1" />
                        {cancellingId === b.id ? 'Cancelling...' : 'Cancel Booking'}
                      </Button>
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic flex items-center gap-1">
                        <AlertCircle size={13} /> Cancellations lock 2h before match
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
