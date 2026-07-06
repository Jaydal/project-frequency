export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReloadWalletDialog } from './reload-wallet-dialog';

export default async function WalletPage() {
  const supabase = await createClient();
  const { data: transactions } = await supabase
    .from('wallet_transactions')
    .select('*, wallets(*, members(*))')
    .order('timestamp', { ascending: false })
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Wallet Transactions</h1>
        <ReloadWalletDialog />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!transactions?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">No transactions found.</TableCell>
              </TableRow>
            ) : (
              transactions.map((tx: any) => {
                const member = tx.wallets?.members;
                return (
                  <TableRow key={tx.id}>
                    <TableCell>{new Date(tx.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{member?.first_name} {member?.last_name}</TableCell>
                    <TableCell>{tx.type}</TableCell>
                    <TableCell className={tx.type === 'Game Charge' ? 'text-red-500' : 'text-green-500'}>
                      {tx.type === 'Game Charge' ? '-' : '+'}₱{tx.amount}
                    </TableCell>
                    <TableCell>{tx.remarks}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
