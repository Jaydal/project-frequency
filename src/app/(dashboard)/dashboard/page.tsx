export const dynamic = 'force-dynamic';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import {
  Users,
  CreditCard,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  Clock,
  Play
} from 'lucide-react';
import Link from 'next/link';

function formatTimeAgo(isoString: string | null) {
  if (!isoString) return '-';
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default async function DashboardPage() {
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [
    { count: membersCount },
    { count: rfidCount },
    { data: allCourts },
    { data: activeGames },
    { data: reloadRows },
    { data: queueEntries },
    { data: recentTransactions },
  ] = await Promise.all([
    supabase.from('members').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
    supabase.from('rfid_cards').select('*', { count: 'exact', head: true }).eq('status', 'Active'),
    supabase.from('courts').select('*').order('name'),
    supabase
      .from('games')
      .select('*, game_players(*, members(*))')
      .eq('status', 'In Progress'),
    supabase
      .from('wallet_transactions')
      .select('amount')
      .eq('type', 'Reload')
      .gte('timestamp', todayStart.toISOString()),
    supabase
      .from('queue_entries')
      .select('*, members(first_name, last_name)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(5),
    supabase
      .from('wallet_transactions')
      .select('*, wallets(*, members(*))')
      .order('timestamp', { ascending: false })
      .limit(5),
  ]);

  const totalCourts = allCourts?.length ?? 0;
  const occupiedCourts = activeGames?.length ?? 0;
  const todayReloads = reloadRows?.reduce((sum: number, r: any) => sum + Number(r.amount), 0) ?? 0;

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Greetings section */}
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">Welcome, Admin</h1>
        <p className="text-sm text-zinc-500 mt-1">Here is a summary of Freq Pickleball Club's operations today.</p>
      </div>

      {/* KPI Overview Widgets */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active Members</CardTitle>
            <Users className="size-4.5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-zinc-250">{membersCount ?? 0}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Registered active players</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Active RFIDs</CardTitle>
            <CreditCard className="size-4.5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-zinc-250">{rfidCount ?? 0}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Linked physical cards</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Today's Revenue</CardTitle>
            <TrendingUp className="size-4.5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-emerald-400">₱{todayReloads.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
            <p className="text-[10px] text-zinc-500 mt-1">Total reload deposits today</p>
          </CardContent>
        </Card>

        <Card className="border-zinc-800 bg-zinc-900/20 hover:border-zinc-700/50 transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Court Utilization</CardTitle>
            <Activity className="size-4.5 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black text-zinc-250">
              {occupiedCourts} <span className="text-lg font-medium text-zinc-500">/ {totalCourts}</span>
            </div>
            <p className="text-[10px] text-zinc-500 mt-1">Courts currently in game</p>
          </CardContent>
        </Card>
      </div>

      {/* Court Grid Status */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-150">Courts Status</h2>
          <Link href="/courts" className="text-xs font-semibold text-emerald-400 hover:text-emerald-350 flex items-center gap-0.5">
            Manage Courts <ArrowUpRight className="size-3.5" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {(allCourts ?? []).map((court: any) => {
            const game = (activeGames ?? []).find((g: any) => g.court_id === court.id);
            const isBusy = court.status === 'In Game';

            return (
              <Card key={court.id} className={`border-zinc-800 bg-zinc-900/10 hover:border-zinc-800/80 transition-all ${isBusy ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-emerald-500'}`}>
                <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-zinc-200">{court.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      isBusy ? 'bg-red-500/15 text-red-400' : 'bg-emerald-500/15 text-emerald-400'
                    }`}>
                      {isBusy ? 'Occupied' : 'Available'}
                    </span>
                  </div>
                  {game ? (
                    <div className="mt-2 space-y-1">
                      <div className="text-xs text-zinc-400 flex items-center gap-1.5">
                        <Play className="size-3 text-zinc-500 fill-zinc-500" />
                        <span className="capitalize">{game.match_type}</span> &middot; {game.duration}m
                      </div>
                      <div className="text-[11px] text-zinc-500 truncate">
                        {(game.game_players ?? []).map((gp: any) => gp.members?.first_name).join(', ')}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-500 mt-4">Ready for immediate play.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Queue & Recent Transactions Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Waiting Queue List */}
        <Card className="border-zinc-800 bg-zinc-900/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-bold text-zinc-150">Next in Queue</CardTitle>
            <span className="text-xs text-zinc-500">Showing top 5</span>
          </CardHeader>
          <CardContent className="p-0 px-6 pb-6">
            <div className="divide-y divide-zinc-800">
              {(queueEntries ?? []).map((entry: any, index: number) => (
                <div key={entry.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="size-6 rounded-full bg-zinc-800 flex items-center justify-center text-xs font-semibold text-zinc-400">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-zinc-200">
                        {entry.members?.first_name} {entry.members?.last_name}
                      </p>
                      <p className="text-xs text-zinc-500 uppercase font-mono tracking-wider">
                        {entry.party_size === 4 ? '2v2' : '1v1'} &middot; {entry.duration} min
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded">
                    ~{index * 30 + 30}m wait
                  </span>
                </div>
              ))}
              {(!queueEntries || queueEntries.length === 0) && (
                <div className="text-center py-8 text-xs text-zinc-500">The queue is currently empty.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Transactions List */}
        <Card className="border-zinc-800 bg-zinc-900/30">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-base font-bold text-zinc-150">Payment Transactions</CardTitle>
            <Link href="/wallet" className="text-xs text-emerald-400 hover:text-emerald-350">
              View History
            </Link>
          </CardHeader>
          <CardContent className="p-0 px-6 pb-6">
            <div className="divide-y divide-zinc-800">
              {(recentTransactions ?? []).map((tx: any) => {
                const isReload = tx.type === 'Reload';
                const member = tx.wallets?.members;
                return (
                  <div key={tx.id} className="flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <div className={`size-8 rounded-full flex items-center justify-center ${
                        isReload ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>
                        {isReload ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-200">
                          {member?.first_name} {member?.last_name}
                        </p>
                        <p className="text-xs text-zinc-500 flex items-center gap-1">
                          <Clock className="size-3" /> {formatTimeAgo(tx.timestamp)}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${
                        isReload ? 'text-emerald-400' : 'text-zinc-200'
                      }`}>
                        {isReload ? '+' : '-'}₱{Number(tx.amount).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-zinc-500 capitalize">{tx.type}</p>
                    </div>
                  </div>
                );
              })}
              {(!recentTransactions || recentTransactions.length === 0) && (
                <div className="text-center py-8 text-xs text-zinc-500">No payment activity yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
