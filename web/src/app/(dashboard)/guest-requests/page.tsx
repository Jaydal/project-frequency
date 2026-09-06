import Link from 'next/link';
import { ArrowLeft, ClipboardCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { GuestBookingRequestsPanel } from '@/components/bookings/GuestBookingRequestsPanel';

export default function GuestRequestsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-3">
        <ClipboardCheck className="mt-1 text-emerald-400" size={22} />
        <div><h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Guest Requests</h1><p className="mt-1 text-sm text-zinc-500">Review guest bookings, confirm payment, and publish approved schedules.</p></div>
      </div>
      <Card className="border-emerald-500/15 bg-zinc-900/30"><CardHeader><CardTitle className="text-base">Requests awaiting staff review</CardTitle></CardHeader><CardContent><GuestBookingRequestsPanel /></CardContent></Card>
      <Link href="/schedules" className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300"><ArrowLeft size={15} /> Back to schedules</Link>
    </div>
  );
}
