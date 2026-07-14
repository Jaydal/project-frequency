'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { updateCourt, deleteCourt } from '@/features/courts/actions';

interface Props {
  court: { id: string; name: string };
}

export function ManageCourtDialog({ court }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(court.name);
  const [newId, setNewId] = useState(court.id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !newId.trim() || (name === court.name && newId === court.id)) return;
    setLoading(true);
    setError(null);
    try {
      await updateCourt(court.id, name.trim(), newId.trim());
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${court.name}"? This cannot be undone.`)) return;
    setLoading(true);
    setError(null);
    try {
      await deleteCourt(court.id);
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button variant="outline" size="sm">Manage</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage {court.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <form onSubmit={handleUpdate} className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-400">Court ID (Hardware Reference)</label>
              <Input value={newId} onChange={e => setNewId(e.target.value)} disabled={loading} placeholder="court-1" />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-xs text-zinc-400">Display Name</label>
              <Input value={name} onChange={e => setName(e.target.value)} disabled={loading} placeholder="Court 1" />
            </div>
            <Button type="submit" disabled={loading || !name.trim() || !newId.trim() || (name === court.name && newId === court.id)}>
              Save Changes
            </Button>
          </form>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="border-t pt-4">
            <Button variant="destructive" onClick={handleDelete} disabled={loading} className="w-full">
              Delete Court
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
