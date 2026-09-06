'use client';

import { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { assignRFID, updateRFID, deleteRFID, type AssignRFIDResult } from '@/features/rfid/actions';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

export default function BulkRegisterClient({ initialCards }: { initialCards: any[] }) {
  const [cards, setCards] = useState<any[]>(initialCards);
  const [uid, setUid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExportCSV = () => {
    if (!cards || cards.length === 0) {
      toast.warning('No cards to export');
      return;
    }
    const headers = ['uid', 'status', 'created_at'];
    const csvContent = [
      headers.join(','),
      ...cards.map(card => [
        card.uid,
        card.status || 'Active',
        card.assigned_date || ''
      ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rfid_cards_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV Exported successfully');
  };

  const handleImportCSVClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportCSVChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const rows = text.split('\n').map(r => r.trim()).filter(r => r.length > 0);
      if (rows.length < 2) {
        throw new Error('CSV is empty or missing headers');
      }
      
      const headers = rows[0].split(',').map(h => h.trim().toLowerCase());
      const uidIndex = headers.indexOf('uid');
      if (uidIndex === -1) {
        throw new Error('CSV must have a "uid" column');
      }
      
      setSubmitting(true);
      let successCount = 0;
      let skipCount = 0;
      let failedCount = 0;
      const failedUids: string[] = [];
      
      for (let i = 1; i < rows.length; i++) {
        const columns = rows[i].split(',').map(c => c.trim());
        const cardUid = columns[uidIndex];
        
        if (!cardUid) continue;
        
        if (cards.some(c => c.uid === cardUid)) {
          skipCount++;
          continue;
        }
        
        try {
          const result: AssignRFIDResult = await assignRFID({ uid: cardUid, memberId: null });
          if (!result.ok) {
            if (result.code === 'RFID_ALREADY_ASSIGNED' || result.code === 'RFID_ALREADY_UNASSIGNED') {
              skipCount++;
            }
          } else {
            successCount++;
          }
        } catch (err: any) {
          failedCount++;
          failedUids.push(cardUid);
          console.error('Failed to import UID:', cardUid, err);
        }
      }
      
      if (failedCount > 0) {
        toast.error(`Import complete: ${successCount} added, ${skipCount} skipped, ${failedCount} failed (${failedUids.join(', ')}).`);
      } else {
        toast.success(`Import complete: ${successCount} added, ${skipCount} skipped.`);
      }
      await refreshCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to import CSV');
    } finally {
      setSubmitting(false);
      e.target.value = '';
    }
  };

  const refreshCards = async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('rfid_cards')
      .select('*, members(*)')
      .order('assigned_date', { ascending: false, nullsFirst: false });
    setCards(data ?? []);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid.trim()) {
      toast('Enter an RFID UID');
      return;
    }
    setSubmitting(true);
    try {
      const result: AssignRFIDResult = await assignRFID({ uid: uid.trim(), memberId: null });
      if (!result.ok) {
        if (result.code === 'RFID_ALREADY_ASSIGNED' || result.code === 'RFID_ALREADY_UNASSIGNED') {
          toast.warning(result.message);
        }
        return;
      }
      setUid('');
      toast.success('RFID card registered');
      await refreshCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to register RFID');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (cardId: string, newStatus: string) => {
    try {
      await updateRFID(cardId, { status: newStatus, memberId: null });
      toast.success('Status updated');
      await refreshCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update status');
    }
  };

  const handleDelete = async (cardId: string) => {
    if (!window.confirm('Delete this RFID card permanently?')) return;
    try {
      await deleteRFID(cardId);
      toast.success('Card deleted');
      await refreshCards();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete card');
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return <span className="text-zinc-600">—</span>;
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <Card className="border-zinc-800 bg-zinc-900/50">
        <CardHeader>
          <CardTitle className="text-zinc-100">Simulated RFID Scan</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="flex gap-3">
            <div className="flex-1 space-y-1">
              <Label htmlFor="uid">Simulated RFID Scan</Label>
              <Input
                id="uid"
                value={uid}
                onChange={e => setUid(e.target.value)}
                placeholder="Type UID and press Enter"
                disabled={submitting}
                className="font-mono text-lg tracking-widest border-zinc-700 bg-zinc-950/40"
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={submitting} className="h-10">
                {submitting ? 'Registering...' : 'Register'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <CardTitle className="text-zinc-100 text-lg">Registered Cards</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="border-zinc-700 bg-zinc-950/40">
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleImportCSVClick} className="border-zinc-700 bg-zinc-950/40" disabled={submitting}>
              {submitting ? 'Importing...' : 'Import CSV'}
            </Button>
            <input 
              type="file" 
              accept=".csv" 
              ref={fileInputRef} 
              onChange={handleImportCSVChange} 
              className="hidden" 
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-zinc-950/40">
              <TableRow className="border-b border-zinc-800 hover:bg-transparent">
                <TableHead className="text-zinc-400 font-semibold h-11">UID</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Registration Date</TableHead>
                <TableHead className="text-zinc-400 font-semibold h-11">Status</TableHead>
                <TableHead className="text-zinc-400 font-semibold text-right h-11 pr-6">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-zinc-800">
              {!cards.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-zinc-500 py-8">
                    No RFID cards registered yet.
                  </TableCell>
                </TableRow>
              ) : (
                cards.map((card: any) => (
                  <TableRow key={card.id} className="border-zinc-800 hover:bg-zinc-800/10 transition-colors">
                    <TableCell className="font-mono text-sm text-zinc-200 py-3.5">
                      {card.uid}
                    </TableCell>
                    <TableCell className="text-zinc-400 py-3.5">
                      {formatDate(card.assigned_date)}
                    </TableCell>
                    <TableCell className="py-3.5">
                      <select
                        value={card.status}
                        onChange={e => handleStatusChange(card.id, e.target.value)}
                        className="h-8 rounded-md border border-zinc-700 bg-zinc-950/40 px-2.5 py-1 text-sm text-zinc-200 outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Unassigned">Unassigned</option>
                      </select>
                    </TableCell>
                    <TableCell className="py-3.5 text-right pr-6">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(card.id)}
                        className="h-8"
                      >
                        Delete
                      </Button>
                    </TableCell>
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
