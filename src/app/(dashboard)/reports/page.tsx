export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

function formatDateTime(isoString: string | null) {
  if (!isoString) return '-';
  const d = new Date(isoString);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export default async function ReportsPage() {
  const supabase = await createClient();

  const [{ data: games }, { data: gameCharges }, { data: reloads }] = await Promise.all([
    supabase.from('games').select('*, courts(name)').order('created_at', { ascending: false }).limit(50),
    supabase.from('wallet_transactions').select('amount').eq('type', 'Game Charge'),
    supabase.from('wallet_transactions').select('amount').eq('type', 'Reload'),
  ]);

  const totalRevenue = gameCharges?.reduce((s: number, r: any) => s + Number(r.amount), 0) ?? 0;
  const totalReloads = reloads?.reduce((s: number, r: any) => s + Number(r.amount), 0) ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">Reports</h1>
        <p className="text-sm text-zinc-500 mt-1">Operational records, revenue summary, and booking activity stats</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Game Revenue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-400">
              ₱{totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">Accumulated bookings and play charges</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Wallet Reloads</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-zinc-255">
              ₱{totalReloads.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">Total deposits reload by staff admins</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardHeader className="pb-4 border-b border-zinc-800/50 bg-zinc-950/20">
          <CardTitle className="text-zinc-200">Recent Games Log</CardTitle>
          <CardDescription className="text-zinc-500">Chronological history of recent pickleball sessions played on all courts</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-950/40">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold h-11">Date & Time</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Court</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Match Type</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Duration</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Charge</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11 pr-6">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {!games?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                    No games recorded.
                  </TableCell>
                </TableRow>
              ) : (
                games.map((g: any) => {
                  const isCompleted = g.status === 'Completed';
                  const isInProgress = g.status === 'In Progress';
                  return (
                    <tr key={g.id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors text-zinc-300">
                      <td className="py-3.5 px-4 text-xs text-zinc-400 tabular-nums">
                        {formatDateTime(g.created_at)}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-zinc-200">{g.courts?.name}</td>
                      <td className="py-3.5 px-4 uppercase text-xs font-semibold tracking-wider text-zinc-500">{g.match_type}</td>
                      <td className="py-3.5 px-4 text-zinc-400">{g.duration} min</td>
                      <td className="py-3.5 px-4 font-mono text-zinc-400">₱{Number(g.charge_amount).toFixed(2)}</td>
                      <td className="py-3.5 px-4 pr-6">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isInProgress
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : isCompleted
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {g.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
