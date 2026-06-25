export const dynamic = "force-dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { prisma } from "@/lib/prisma";

export default async function DashboardPage() {
  const membersCount = await prisma.member.count({ where: { status: 'Active' } });
  const rfidCount = await prisma.rFIDCard.count({ where: { status: 'Active' } });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayReloads = await prisma.walletTransaction.aggregate({
    _sum: { amount: true },
    where: {
      type: 'Reload',
      timestamp: { gte: today }
    }
  });

  const activeCourts = await prisma.court.count({ where: { status: 'In Game' } });

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{membersCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active RFIDs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{rfidCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today&apos;s Revenue (Reloads)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₱{todayReloads._sum.amount || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeCourts} / 2</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
