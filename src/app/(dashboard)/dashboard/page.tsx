export const dynamic = 'force-dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();

  const [
    { count: membersCount },
    { count: rfidCount },
    { count: activeCourts },
    { data: reloadRows },
  ] = await Promise.all([
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
    supabase.from('rfid_cards').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
    supabase.from('courts').select('*', { count: 'exact', head: true }).eq('status', 'In Game'),
    supabase.from('wallet_transactions').select('amount').eq('type', 'Reload').gte('timestamp', (() => {
      const d = new Date(); d.setHours(0,0,0,0); return d.toISOString();
    })()),
  ]);

  const todayReloads = reloadRows?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) ?? 0;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersCount ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active RFIDs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rfidCount ?? 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Revenue (Reloads)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{todayReloads}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCourts ?? 0} / 2</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
