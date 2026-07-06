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
    .order('assigned_date', { ascending: false });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">RFID Management</h1>
        <AssignRFIDDialog />
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>UID</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Assigned Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {!cards?.length ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">No RFIDs assigned.</TableCell>
              </TableRow>
            ) : (
              cards.map((card: any) => (
                <TableRow key={card.id}>
                  <TableCell className="font-mono">{card.uid}</TableCell>
                  <TableCell>{card.members?.first_name} {card.members?.last_name}</TableCell>
                  <TableCell>{new Date(card.assigned_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={card.status === 'Active' ? 'default' : 'secondary'}>
                      {card.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
