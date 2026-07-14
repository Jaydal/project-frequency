export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddMemberDialog } from './add-member-dialog';
import { AssignRfidButton, ReloadWalletButton } from './member-actions';
import { Card, CardContent } from '@/components/ui/card';

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from('members')
    .select('*, rfid_cards(*), wallets(*)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">Members</h1>
          <p className="text-sm text-zinc-500 mt-1">{members?.length ?? 0} registered members</p>
        </div>
        <AddMemberDialog />
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-950/40">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold h-11">Member ID</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Name</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">RFID Card</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Balance</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Status</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-right h-11 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {!members?.length ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-zinc-500 py-8">
                    No members found.
                  </TableCell>
                </TableRow>
              ) : (
                members.map((m: any) => {
                  const activeRfid = (m.rfid_cards ?? []).find((c: any) => c.status === 'Active');
                  const wallet = Array.isArray(m.wallets) ? m.wallets[0] : m.wallets;
                  const isActive = m.status === 'Active';

                  return (
                    <TableRow key={m.id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                      <TableCell className="font-mono text-xs text-zinc-400 py-3.5">
                        {m.member_id}
                      </TableCell>
                      <TableCell className="font-semibold text-zinc-200 py-3.5">
                        {m.first_name} {m.last_name}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-400 py-3.5">
                        {activeRfid?.uid ?? <span className="text-zinc-600">—</span>}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-emerald-400 font-bold py-3.5">
                        ₱{Number(wallet?.balance ?? 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {m.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 text-right pr-6">
                        <div className="flex gap-1.5 justify-end">
                          {!activeRfid && <AssignRfidButton memberId={m.member_id} />}
                          <ReloadWalletButton memberId={m.member_id} />
                        </div>
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
