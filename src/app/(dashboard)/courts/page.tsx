export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { getCourtStatus } from '@/lib/mqtt';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import DisplayControl from '@/components/courts/DisplayControl';
import QueuePanel from '@/components/courts/QueuePanel';
import HealthBadge from '@/components/ui/HealthBadge';
import CourtDeviceBadge from '@/components/courts/CourtDeviceBadge';
import AddCourtForm from '@/components/courts/AddCourtForm';
import { ManageCourtDialog } from '@/components/courts/ManageCourtDialog';
import { GameActions } from '@/components/courts/GameActions';

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

export default async function CourtsPage() {
  const supabase = await createClient();

  const [{ data: courts }, { data: activeGames }, { data: recentGames }] = await Promise.all([
    supabase.from('courts').select('*').order('name'),
    supabase
      .from('games')
      .select('*, game_players(*, members(*))')
      .eq('status', 'In Progress')
      .order('start_time', { ascending: false }),
    supabase
      .from('games')
      .select('*, courts(name), game_players(*, members(*))')
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const courtList = (courts ?? []).map((c: any) => ({ id: c.id, name: c.name }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Court Monitor</h1>
          <p className="text-sm text-zinc-500 mt-1">{courts?.length ?? 0} courts</p>
        </div>
        <HealthBadge />
      </div>

      {/* Add Court Form */}
      <AddCourtForm />

      {/* Court status cards */}
      <div className="grid gap-6 md:grid-cols-2">
        {(courts ?? []).map((court: any) => {
          const activeGame = (activeGames ?? []).find((g: any) => g.court_id === court.id);
          const deviceStatus = getCourtStatus(court.id);

          return (
            <Card
              key={court.id}
              className={court.status === 'In Game' ? 'border-red-500' : 'border-green-500'}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl flex justify-between items-center gap-2">
                  <span>{court.name}</span>
                  <div className="flex items-center gap-2">
                    <CourtDeviceBadge courtId={court.id} initialStatus={deviceStatus} />
                    <span className={`text-sm px-3 py-1 rounded-full ${
                      court.status === 'In Game'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {court.status}
                    </span>
                    <ManageCourtDialog court={court} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeGame ? (
                  <div className="space-y-4">
                    <div className="text-sm text-zinc-400">
                      Match: {activeGame.match_type} · Duration: {activeGame.duration} min
                    </div>
                    <div>
                      <h4 className="font-semibold text-zinc-200 mb-2">Players:</h4>
                      <ul className="list-disc list-inside text-sm">
                        {(activeGame.game_players ?? []).map((p: any) => (
                          <li key={p.id}>{p.members?.first_name} {p.members?.last_name}</li>
                        ))}
                      </ul>
                    </div>
                    <GameActions gameId={activeGame.id} courtId={court.id} courtName={court.name} />
                  </div>
                ) : (
                  <div className="text-zinc-500 py-8 text-center">Court is currently available.</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Queue + Display management */}
      <div className="grid gap-6 md:grid-cols-2">
        <QueuePanel courts={courtList} />
        <DisplayControl courts={courtList} />
      </div>

      {/* Booking History */}
      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardHeader>
          <CardTitle>Recent Booking History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-450 font-medium">
                  <th className="pb-3 pr-4">Court</th>
                  <th className="pb-3 pr-4">Match</th>
                  <th className="pb-3 pr-4">Players</th>
                  <th className="pb-3 pr-4">Date & Time</th>
                  <th className="pb-3 pr-4">Duration</th>
                  <th className="pb-3 pr-4">Cost</th>
                  <th className="pb-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {(recentGames ?? []).map((game: any) => {
                  const playerNames = (game.game_players ?? [])
                    .map((gp: any) => `${gp.members?.first_name ?? ''} ${gp.members?.last_name ?? ''}`.trim())
                    .filter(Boolean)
                    .join(', ');

                  return (
                    <tr key={game.id} className="text-zinc-350 hover:bg-zinc-800/10">
                      <td className="py-3 pr-4 font-semibold text-zinc-200">
                        {game.courts?.name ?? 'Unknown'}
                      </td>
                      <td className="py-3 pr-4 uppercase text-xs font-semibold tracking-wider text-zinc-500">
                        {game.match_type}
                      </td>
                      <td className="py-3 pr-4 text-zinc-350 truncate max-w-[200px]" title={playerNames}>
                        {playerNames || 'No Players'}
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">
                        {formatDateTime(game.start_time)}
                      </td>
                      <td className="py-3 pr-4 text-zinc-400">
                        {game.duration} min
                      </td>
                      <td className="py-3 pr-4 font-mono text-zinc-400">
                        ${Number(game.charge_amount).toFixed(2)}
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          game.status === 'In Progress'
                            ? 'bg-red-500/10 text-red-400 border-red-500/20'
                            : game.status === 'Completed'
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : game.status === 'Cancelled'
                            ? 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}>
                          {game.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {(!recentGames || recentGames.length === 0) && (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-zinc-500">
                      No recent bookings found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
