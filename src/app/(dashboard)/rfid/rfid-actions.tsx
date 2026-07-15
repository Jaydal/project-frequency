'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { unassignRFID, deleteRFID, updateRFID } from '@/features/rfid/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Link2Off } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function UnassignRfidButton({ cardId, cardUid }: { cardId: string; cardUid: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleUnassign = async () => {
    setLoading(true);
    try {
      await unassignRFID(cardId);
      setOpen(false);
      toast.success('RFID card unassigned successfully');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to unassign card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" title="Unassign Card" />}>
        <Link2Off className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unassign RFID Card</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Are you sure you want to unassign RFID card <span className="font-mono text-zinc-200">{cardUid}</span>?
            It will remain in the system as an unassigned card, ready to be linked to another member.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="default" onClick={handleUnassign} disabled={loading}>
              {loading ? 'Unassigning...' : 'Unassign Card'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function EditRfidButton({ card }: { card: any }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(card.status);
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(
    card.members ? { id: card.members.id, name: `${card.members.first_name} ${card.members.last_name}` } : null
  );
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const supabase = createClient();
  const router = useRouter();

  useEffect(() => {
    if (search.length < 2) { setMembers([]); return; }
    setSearching(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data } = await supabase
        .from('members')
        .select('id, member_id, first_name, last_name')
        .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,member_id.ilike.%${search}%`)
        .limit(10);
      setMembers(data ?? []);
      setSearching(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [search, supabase]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateRFID(card.id, {
        status,
        memberId: selected?.id ?? null,
      });
      setOpen(false);
      toast.success('RFID card updated successfully');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update card');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" title="Edit Card" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit RFID Card</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Card UID</Label>
            <Input value={card.uid} disabled className="font-mono bg-zinc-900" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500 text-zinc-200"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Unassigned">Unassigned</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>Assign to Member</Label>
            <div className="flex gap-2 items-center">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={selected ? selected.name : "Search members..."}
              />
              {selected && (
                <Button type="button" variant="ghost" size="xs" onClick={() => { setSelected(null); setSearch(''); }}>
                  Clear
                </Button>
              )}
            </div>
            {searching && <p className="text-xs text-zinc-500">Searching...</p>}
            {members.length > 0 && (
              <div className="border border-zinc-800 rounded-md max-h-40 overflow-y-auto space-y-0.5 bg-zinc-950">
                {members.map((m: any) => {
                  const fullName = `${m.first_name} ${m.last_name}`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        setSelected({ id: m.id, name: fullName });
                        setSearch(fullName);
                        setMembers([]);
                      }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-800/50 cursor-pointer"
                    >
                      <span className="font-medium text-zinc-200">{fullName}</span>
                      <span className="text-zinc-500 ml-2">#{m.member_id}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {selected && (
              <p className="text-xs text-emerald-400">Assigned member: {selected.name}</p>
            )}
          </div>
          <Button type="submit" className="w-full mt-2">Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteRfidButton({ cardId, cardUid }: { cardId: string; cardUid: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setLoading(true);
    try {
      await deleteRFID(cardId);
      setOpen(false);
      toast.success('RFID card permanently deleted');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete card');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" className="text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/20" title="Delete Card" />}>
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete RFID Card</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Are you sure you want to permanently delete RFID card <span className="font-mono text-zinc-200">{cardUid}</span>?
            This action cannot be undone and will delete the card record entirely.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              {loading ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
