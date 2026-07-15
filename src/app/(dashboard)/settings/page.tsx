export const dynamic = 'force-dynamic';
import { createClient } from '@/lib/supabase/server';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ProductsEditor } from '@/features/settings/components/ProductsEditor';
import { DisplaySequenceEditor } from '@/features/settings/components/DisplaySequenceEditor';

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: settings } = await supabase.from('settings').select('*');

  const productsRow = settings?.find(s => s.key === 'products');
  const pricesRow = settings?.find(s => s.key === 'prices');
  const prepRow = settings?.find(s => s.key === 'preparationTime');
  const sequenceRow = settings?.find(s => s.key === 'displaySequence');

  const matchTypes: string[] = productsRow?.value ? JSON.parse(productsRow.value).matchTypes ?? ['1v1', '2v2'] : ['1v1', '2v2'];
  const durations: number[] = productsRow?.value ? JSON.parse(productsRow.value).durations ?? [30, 60, 90] : [30, 60, 90];
  const rates: Record<string, number> = pricesRow?.value ? JSON.parse(pricesRow.value) : { '30': 150, '60': 300, '90': 450 };
  const prepTimeSec = parseInt(prepRow?.value ?? '300', 10);

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">System Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure pickleball court products, rates, display layouts, and device parameters</p>
      </div>

      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-zinc-200">Products & Match Rules</CardTitle>
          <CardDescription className="text-zinc-500">Configure available match types, durations, rates, and preparation time.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProductsEditor matchTypes={matchTypes} durations={durations} rates={rates} prepTimeSec={prepTimeSec} />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/30">
        <CardHeader className="pb-4">
          <CardTitle className="text-zinc-200">Display Sequence</CardTitle>
          <CardDescription className="text-zinc-500">Configure what the LED panels show and how they cycle. Each state (idle, prep, game) has a sequence of pages that rotate at the configured interval.</CardDescription>
        </CardHeader>
        <CardContent>
          <DisplaySequenceEditor sequence={sequenceRow?.value ?? ''} />
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardHeader className="pb-4 border-b border-zinc-800/50 bg-zinc-950/20">
          <CardTitle className="text-zinc-200">Raw Settings Sync</CardTitle>
          <CardDescription className="text-zinc-500">These configurations are synchronized with the physical RFID kiosk terminal and LED matrix controllers.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-950/40">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold h-11">Key</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Value</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11 pr-6">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {!settings?.length ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                    No settings configured yet.
                  </TableCell>
                </TableRow>
              ) : (
                settings.map((s: any) => (
                  <TableRow key={s.id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                    <TableCell className="font-semibold text-zinc-200 py-3.5">{s.key}</TableCell>
                    <TableCell className="font-mono text-zinc-400 text-xs py-3.5 max-w-[250px] truncate">{s.value}</TableCell>
                    <TableCell className="text-zinc-400 py-3.5 pr-6">{s.description}</TableCell>
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
