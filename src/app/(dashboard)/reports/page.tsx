export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Reports</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Total Game Revenue</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">₱{totalRevenue}</div></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Total Wallet Reloads</CardTitle></CardHeader>
          <CardContent><div className="text-3xl font-bold">₱{totalReloads}</div></CardContent>
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
              {!games?.length ? (
                <TableRow><TableCell colSpan={6} className="text-center">No games recorded.</TableCell></TableRow>
              ) : (
                games.map((g: any) => (
                  <TableRow key={g.id}>
                    <TableCell>{new Date(g.created_at).toLocaleString()}</TableCell>
                    <TableCell>{g.courts?.name}</TableCell>
                    <TableCell>{g.match_type}</TableCell>
                    <TableCell>{g.duration} min</TableCell>
                    <TableCell>₱{g.charge_amount}</TableCell>
                    <TableCell>{g.status}</TableCell>
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
