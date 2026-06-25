import { prisma } from "@/lib/prisma";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { AddMemberDialog } from "./add-member-dialog";

export default async function MembersPage() {
  const members = await prisma.member.findMany({
    include: {
      rfidCards: { where: { status: 'Active' } },
      wallet: true
    },
    orderBy: { createdAt: 'desc' }
  });

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
            {members.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center">No members found.</TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.memberId}</TableCell>
                  <TableCell>{member.firstName} {member.lastName}</TableCell>
                  <TableCell>
                    {member.rfidCards[0]?.uid || <span className="text-gray-400">Not Assigned</span>}
                  </TableCell>
                  <TableCell>₱{member.wallet?.balance || 0}</TableCell>
                  <TableCell>{member.status}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
