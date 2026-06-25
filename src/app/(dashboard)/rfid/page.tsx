export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AssignRFIDDialog } from "./assign-rfid-dialog";
import { Badge } from "@/components/ui/badge";

export default async function RFIDPage() {
  const cards = await prisma.rFIDCard.findMany({
    include: { member: true },
    orderBy: { assignedDate: 'desc' }
  });

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
            {cards.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center">No RFIDs assigned.</TableCell>
              </TableRow>
            ) : (
              cards.map((card) => (
                <TableRow key={card.id}>
                  <TableCell className="font-mono">{card.uid}</TableCell>
                  <TableCell>{card.member.firstName} {card.member.lastName}</TableCell>
                  <TableCell>{card.assignedDate.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <Badge variant={card.status === 'Active' ? 'default' : 'secondary'}>{card.status}</Badge>
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
