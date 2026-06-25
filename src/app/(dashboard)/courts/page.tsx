export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function CourtsPage() {
  const courts = await prisma.court.findMany({
    include: {
      games: {
        where: { status: 'In Progress' },
        include: { players: { include: { member: true } } },
        orderBy: { startTime: 'desc' },
        take: 1
      }
    }
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Court Monitor</h1>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {courts.map(court => {
          const activeGame = court.games[0];
          return (
            <Card key={court.id} className={court.status === 'In Game' ? 'border-red-500' : 'border-green-500'}>
              <CardHeader className="pb-2">
                <CardTitle className="text-2xl flex justify-between items-center">
                  {court.name}
                  <span className={`text-sm px-3 py-1 rounded-full ${court.status === 'In Game' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                    {court.status}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activeGame ? (
                  <div className="space-y-4">
                    <div className="text-sm text-gray-500">
                      Match: {activeGame.matchType} | Duration: {activeGame.duration} min
                    </div>
                    <div>
                      <h4 className="font-semibold mb-2">Players:</h4>
                      <ul className="list-disc list-inside text-sm">
                        {activeGame.players.map(p => (
                          <li key={p.id}>{p.member.firstName} {p.member.lastName}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="text-gray-500 py-8 text-center">
                    Court is currently available.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
