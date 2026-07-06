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

export default async function CourtsPage() {
  const supabase = await createClient();

  const [{ data: courts }, { data: activeGames }] = await Promise.all([
    supabase.from('courts').select('*').order('name'),
    supabase
      .from('games')
      .select('*, game_players(*, members(*))')
      .eq('status', 'In Progress')
      .order('start_time', { ascending: false }),
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
    </div>
  );
}
