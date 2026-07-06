export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddMemberDialog } from './add-member-dialog';
import { AssignRfidButton, ReloadWalletButton } from './member-actions';

export default async function MembersPage() {
  const supabase = await createClient();
  const { data: members } = await supabase
    .from('members')
    .select('*, rfid_cards(*), wallets(*)')
    .order('created_at', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">Members</h1>
        <AddMemberDialog />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>RFID</TableHead>
              <TableHead>Balance</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!members?.length ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center">No members found.</TableCell>
              </TableRow>
            ) : (
              members.map((m: any) => {
                const activeRfid = (m.rfid_cards ?? []).find((c: any) => c.status === 'Active');
                const wallet = Array.isArray(m.wallets) ? m.wallets[0] : m.wallets;
                return (
                  <TableRow key={m.id}>
                    <TableCell className="font-mono text-sm">{m.member_id}</TableCell>
                    <TableCell>{m.first_name} {m.last_name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {activeRfid?.uid ?? <span className="text-zinc-500">—</span>}
                    </TableCell>
                    <TableCell>₱{wallet?.balance ?? 0}</TableCell>
                    <TableCell>{m.status}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
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
      </div>
    </div>
  );
}
