export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AssignRFIDDialog } from './assign-rfid-dialog';
import { Badge } from '@/components/ui/badge';

export default async function RFIDPage() {
  const supabase = await createClient();
  const { data: cards } = await supabase
    .from('rfid_cards')
    .select('*, members(*)')
    .order('assigned_date', { ascending: false, nullsFirst: false });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">RFID Management</h1>
          <p className="text-sm text-zinc-500 mt-1">{cards?.length ?? 0} cards registered</p>
        </div>
        <AssignRFIDDialog />
      </div>

      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>UID</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Assigned</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!cards?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-zinc-500 py-8">No RFID cards yet.</TableCell>
              </TableRow>
            ) : (
              cards.map((card: any) => {
                const member = Array.isArray(card.members) ? card.members[0] : card.members;
                const isUnassigned = card.status === 'Unassigned' || !member;
                return (
                  <TableRow key={card.id}>
                    <TableCell className="font-mono text-sm">{card.uid}</TableCell>
                    <TableCell>
                      {isUnassigned ? (
                        <span className="text-zinc-500 italic">Unassigned</span>
                      ) : (
                        <span className="text-sm font-medium">{member?.first_name} {member?.last_name}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-zinc-400 tabular-nums">
                      {card.assigned_date ? new Date(card.assigned_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={card.status === 'Active' ? 'default' : 'secondary'}>
                        {card.status}
                      </Badge>
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
