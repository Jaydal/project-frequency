export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReloadWalletDialog } from './reload-wallet-dialog';
import { Card, CardContent } from '@/components/ui/card';

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: string; border: string }> = {
  'Game Charge': { bg: 'bg-red-500/10', text: 'text-red-400', icon: '−', border: 'border-red-500/20' },
  'Reload': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '+', border: 'border-emerald-500/20' },
  'Refund': { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '+', border: 'border-blue-500/20' },
  'Adjustment': { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: '±', border: 'border-amber-500/20' },
};

function formatDate(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAmount(amount: number): string {
  return `₱${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">Wallet Transactions</h1>
          <p className="text-sm text-zinc-500 mt-1">Transaction history and credit reload records</p>
        </div>
        <ReloadWalletDialog />
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-950/40">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold h-11">Date</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Member</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Type</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-right h-11">Amount</TableHead>
                <TableHead className="text-zinc-400 font-semibold hidden md:table-cell h-11 pr-6">Remarks</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {!transactions?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                    No transactions yet.
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx: any) => {
                  const wallet = Array.isArray(tx.wallets) ? tx.wallets[0] : tx.wallets;
                  const member = Array.isArray(wallet?.members) ? wallet.members[0] : wallet?.members;
                  const style = TYPE_STYLES[tx.type] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: '·', border: 'border-zinc-500/20' };
                  const isDebit = tx.type === 'Game Charge';
                  return (
                    <TableRow key={tx.id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                      <TableCell className="text-xs text-zinc-400 py-3.5 tabular-nums whitespace-nowrap">
                        {formatDate(tx.timestamp)}
                      </TableCell>
                      <TableCell className="font-semibold text-zinc-200 py-3.5">
                        {member?.first_name} {member?.last_name}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${style.bg} ${style.text} ${style.border}`}>
                          {style.icon} {tx.type}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-bold py-3.5 tabular-nums ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
                        {isDebit ? '−' : '+'}{formatAmount(tx.amount)}
                      </TableCell>
                      <TableCell className="text-zinc-400 py-3.5 hidden md:table-cell max-w-[200px] truncate pr-6">
                        {tx.remarks || '—'}
                      </TableCell>
                    </TableRow>
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
