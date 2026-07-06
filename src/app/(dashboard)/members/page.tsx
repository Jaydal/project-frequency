export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AddMemberDialog } from './add-member-dialog';

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
              <TableHead>RFID UID</TableHead>
              <TableHead>Wallet Balance</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!members?.length ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">No members found.</TableCell>
              </TableRow>
            ) : (
              members.map((m: any) => {
                const activeRfid = (m.rfid_cards ?? []).find((c: any) => c.status === 'Active');
                const wallet = Array.isArray(m.wallets) ? m.wallets[0] : m.wallets;
                return (
                  <TableRow key={m.id}>
                    <TableCell>{m.member_id}</TableCell>
                    <TableCell>{m.first_name} {m.last_name}</TableCell>
                    <TableCell>
                      {activeRfid?.uid ?? <span className="text-gray-400">Not Assigned</span>}
                    </TableCell>
                    <TableCell>₱{wallet?.balance ?? 0}</TableCell>
                    <TableCell>{m.status}</TableCell>
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
