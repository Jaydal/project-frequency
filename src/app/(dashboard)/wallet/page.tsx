export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ReloadWalletDialog } from './reload-wallet-dialog';

const TYPE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  'Game Charge': { bg: 'bg-red-500/10', text: 'text-red-400', icon: '−' },
  'Reload': { bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: '+' },
  'Refund': { bg: 'bg-blue-500/10', text: 'text-blue-400', icon: '+' },
  'Adjustment': { bg: 'bg-amber-500/10', text: 'text-amber-400', icon: '±' },
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
  return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAmount(amount: number): string {
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
          <h1 className="text-3xl font-bold tracking-tight">Wallet</h1>
          <p className="text-sm text-zinc-500 mt-1">Transaction history</p>
        </div>
        <ReloadWalletDialog />
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="hidden md:table-cell">Remarks</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!transactions?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-zinc-500 py-8">No transactions yet.</TableCell>
              </TableRow>
            ) : (
              transactions.map((tx: any) => {
                const wallet = Array.isArray(tx.wallets) ? tx.wallets[0] : tx.wallets;
                const member = Array.isArray(wallet?.members) ? wallet.members[0] : wallet?.members;
                const style = TYPE_STYLES[tx.type] ?? { bg: 'bg-zinc-500/10', text: 'text-zinc-400', icon: '·' };
                const isDebit = tx.type === 'Game Charge';
                return (
                  <TableRow key={tx.id}>
                    <TableCell className="text-sm text-zinc-400 tabular-nums whitespace-nowrap">
                      {formatDate(tx.timestamp)}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {member?.first_name} {member?.last_name}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
                        {style.icon} {tx.type}
                      </span>
                    </TableCell>
                    <TableCell className={`text-right font-mono tabular-nums font-semibold ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
                      {isDebit ? '−' : '+'}{formatAmount(tx.amount)}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-500 hidden md:table-cell max-w-[200px] truncate">
                      {tx.remarks || '—'}
                    </TableCell>
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
