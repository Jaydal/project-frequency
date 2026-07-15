export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AssignRFIDDialog } from './assign-rfid-dialog';
import { EditRfidButton, UnassignRfidButton, DeleteRfidButton } from './rfid-actions';
import { Card, CardContent } from '@/components/ui/card';

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
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">RFID Cards</h1>
          <p className="text-sm text-zinc-500 mt-1">{cards?.length ?? 0} registered cards</p>
        </div>
        <AssignRFIDDialog />
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-950/40">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold h-11">Card UID</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Assigned Member</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Assignment Date</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Status</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-right h-11 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {!cards?.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                    No RFID cards registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                cards.map((card: any) => {
                  const member = Array.isArray(card.members) ? card.members[0] : card.members;
                  const isUnassigned = card.status === 'Unassigned' || !member;
                  const isActive = card.status === 'Active';

                  return (
                    <TableRow key={card.id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                      <TableCell className="font-mono text-sm text-zinc-200 py-3.5">
                        {card.uid}
                      </TableCell>
                      <TableCell className="py-3.5">
                        {isUnassigned ? (
                          <span className="text-zinc-500 italic text-xs">Unassigned</span>
                        ) : (
                          <span className="text-sm font-semibold text-zinc-200">{member?.first_name} {member?.last_name}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-zinc-400 py-3.5">
                        {card.assigned_date
                          ? new Date(card.assigned_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : <span className="text-zinc-600">—</span>}
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                          isActive
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                        }`}>
                          {card.status}
                        </span>
                      </TableCell>
                      <TableCell className="py-3.5 text-right pr-6">
                        <div className="flex gap-1.5 justify-end items-center">
                          {!isUnassigned && (
                            <UnassignRfidButton cardId={card.id} cardUid={card.uid} />
                          )}
                          <EditRfidButton card={card} />
                          <DeleteRfidButton cardId={card.id} cardUid={card.uid} />
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
