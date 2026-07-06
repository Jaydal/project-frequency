export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from('settings').select('*');

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>

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
              {!settings?.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center">No settings configured yet.</TableCell>
                </TableRow>
              ) : (
                settings.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.key}</TableCell>
                    <TableCell>{s.value}</TableCell>
                    <TableCell>{s.description}</TableCell>
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
