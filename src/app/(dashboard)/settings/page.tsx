export const dynamic = "force-dynamic";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Configuration Keys</CardTitle>
          <CardDescription>These settings are synced with the RFID controller hardware.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">No settings configured yet.</TableCell>
                </TableRow>
              ) : (
                settings.map(setting => (
                  <TableRow key={setting.id}>
                    <TableCell className="font-medium">{setting.key}</TableCell>
                    <TableCell>{setting.value}</TableCell>
                    <TableCell>{setting.description}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
