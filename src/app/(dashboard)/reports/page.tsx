export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function ReportsPage() {
  const games = await prisma.game.findMany({
    orderBy: { createdAt: 'desc' },
    include: { court: true },
    take: 50
  });

  const totalRevenue = await prisma.walletTransaction.aggregate({
    _sum: { amount: true },
    where: { type: 'Game Charge' }
  });

  const totalReloads = await prisma.walletTransaction.aggregate({
    _sum: { amount: true },
    where: { type: 'Reload' }
  });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Total Game Revenue</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">₱{totalRevenue._sum.amount || 0}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Wallet Reloads</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">₱{totalReloads._sum.amount || 0}</div></CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent Games</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Court</TableHead>
                <TableHead>Match Type</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Charge</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {games.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center">No games recorded.</TableCell></TableRow>
              ) : (
                games.map(game => (
                  <TableRow key={game.id}>
                    <TableCell>{game.createdAt.toLocaleString()}</TableCell>
                    <TableCell>{game.court.name}</TableCell>
                    <TableCell>{game.matchType}</TableCell>
                    <TableCell>{game.duration} min</TableCell>
                    <TableCell>₱{game.chargeAmount}</TableCell>
                    <TableCell>{game.status}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
