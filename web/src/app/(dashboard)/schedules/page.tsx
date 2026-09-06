import Link from 'next/link';
import { Calendar, ClipboardCheck, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuestBookingRequestsPanel } from '@/components/bookings/GuestBookingRequestsPanel';
import { createClient } from '@/lib/supabase/server';

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function statusClass(status: string) {
  return status === 'In Progress'
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
}

export default async function SchedulesPage() {
  const supabase = await createClient();
  const { data: bookings, error } = await supabase
    .from('games')
    .select('id, start_time, duration, match_type, match_title, status, charge_amount, courts(name), game_players(id)')
    .in('status', ['Scheduled', 'In Progress'])
    .gte('start_time', new Date().toISOString())
    .order('start_time', { ascending: true })
    .limit(50);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3"><Calendar className="mt-1 text-emerald-400" size={22} /><div><h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Schedules</h1><p className="text-sm text-zinc-500 mt-1">Review upcoming court reservations and approve guest requests.</p></div></div>
        <Link href="/book" className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"><Plus size={15} /> Create booking</Link>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardHeader className="border-b border-zinc-800/70"><CardTitle className="text-base font-bold">Upcoming bookings</CardTitle><p className="text-xs text-zinc-500">Scheduled games are shown in start-time order.</p></CardHeader>
        <CardContent className="p-0">
          {error ? <p className="p-6 text-sm text-red-300">Unable to load upcoming bookings.</p> : !bookings?.length ? <div className="px-6 py-12 text-center"><Calendar className="mx-auto mb-3 text-zinc-600" size={26} /><p className="font-semibold text-zinc-300">No upcoming bookings</p><p className="mt-1 text-sm text-zinc-500">Create a member booking or review a guest request to fill the schedule.</p></div> : (
            <div className="divide-y divide-zinc-800/80">
              {bookings.map((booking: any) => <div key={booking.id} className="grid gap-3 px-5 py-4 md:grid-cols-[1.2fr_1fr_1fr_0.8fr_auto] md:items-center"><div><p className="font-semibold text-zinc-100">{booking.courts?.name ?? 'Unassigned court'}</p><p className="text-xs text-zinc-500">{booking.match_title || (booking.match_type === '2v2' ? 'Doubles match' : 'Singles match')}</p></div><p className="text-sm text-zinc-300">{formatDateTime(booking.start_time)}</p><p className="text-sm text-zinc-400">{booking.duration} min · {booking.game_players?.length ?? 0} players</p><span className={`w-fit rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClass(booking.status)}`}>{booking.status}</span><span className="font-mono text-sm text-zinc-400">₱{Number(booking.charge_amount ?? 0).toFixed(2)}</span></div>)}
            </div>
          )}
        </CardContent>
      </Card>
      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-base font-bold"><ClipboardCheck size={17} className="text-emerald-400" /> Guest Booking Requests</CardTitle><Link href="/guest-requests" className="text-xs font-semibold text-emerald-400 hover:text-emerald-300">Open full queue →</Link></CardHeader>
        <CardContent><GuestBookingRequestsPanel compact /></CardContent>
      </Card>
    </div>
  );
}
