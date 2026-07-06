export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProductsEditor } from '@/features/settings/components/ProductsEditor';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from('settings').select('*');

  const productsRow = settings?.find(s => s.key === 'products');
  const pricesRow = settings?.find(s => s.key === 'prices');
  const prepRow = settings?.find(s => s.key === 'preparationTime');

  const matchTypes: string[] = productsRow?.value ? JSON.parse(productsRow.value).matchTypes ?? ['1v1', '2v2'] : ['1v1', '2v2'];
  const durations: number[] = productsRow?.value ? JSON.parse(productsRow.value).durations ?? [30, 60, 90] : [30, 60, 90];
  const rates: Record<string, number> = pricesRow?.value ? JSON.parse(pricesRow.value) : { '30': 150, '60': 300, '90': 450 };
  const prepTimeSec = parseInt(prepRow?.value ?? '300', 10);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Products</CardTitle>
          <CardDescription>Configure available match types, durations, rates, and preparation time.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductsEditor matchTypes={matchTypes} durations={durations} rates={rates} prepTimeSec={prepTimeSec} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Settings</CardTitle>
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
