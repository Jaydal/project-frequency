'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { assignRFID } from '@/features/rfid/actions';
import { reloadWallet } from '@/features/wallet/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useEffect } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { updateMember, deleteMember } from '@/features/members/actions';

export function AssignRfidButton({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState('');
  const [unassignedCards, setUnassignedCards] = useState<{uid: string}[]>([]);
  const [isScanningNFC, setIsScanningNFC] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(true);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== "undefined" && !("NDEFReader" in window)) {
      setNfcSupported(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      supabase.from('rfid_cards').select('uid').eq('status', 'Unassigned').then(({ data }) => {
        setUnassignedCards(data ?? []);
      });
    }
  }, [open, supabase]);

  const startNFCScan = async () => {
    try {
      const ndef = new (window as any).NDEFReader();
      await ndef.scan();
      setIsScanningNFC(true);
      toast("Ready to scan! Hold an NFC card to the back of your phone.");

      ndef.addEventListener("reading", ({ serialNumber }: any) => {
        if (serialNumber) {
          const formattedUID = serialNumber.replace(/:/g, "").toUpperCase();
          setUid(formattedUID);
          setIsScanningNFC(false);
          toast.success("NFC card detected!");
        }
      });
      
      ndef.addEventListener("readingerror", () => {
        toast.error("NFC read error. Try holding it steady.");
        setIsScanningNFC(false);
      });
    } catch (error: any) {
      toast.error("NFC Error: " + error.message);
      setIsScanningNFC(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assignRFID({ memberId, uid: uid.trim() });
      setOpen(false);
      setUid('');
      toast('RFID assigned');
      router.refresh();
    } catch {
      toast('Failed to assign RFID');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Assign RFID
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign RFID to {memberId}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="uid">RFID UID</Label>
              <div className="flex gap-2">
                <Input
                  id="uid"
                  value={uid}
                  onChange={(e) => setUid(e.target.value)}
                  required
                  placeholder="e.g. 04A1B2C3"
                  className="font-mono"
                />
                {nfcSupported && (
                  <Button 
                    type="button" 
                    variant={isScanningNFC ? "secondary" : "outline"}
                    onClick={startNFCScan}
                    className={isScanningNFC ? "animate-pulse border-emerald-500 text-emerald-500" : ""}
                  >
                    {isScanningNFC ? "Scanning..." : "Scan NFC"}
                  </Button>
                )}
              </div>
            </div>

            {unassignedCards.length > 0 && (
              <div className="space-y-2">
                <Label>Or select an existing Unassigned Card</Label>
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {unassignedCards.map(c => (
                    <button 
                      key={c.uid} 
                      type="button"
                      onClick={() => setUid(c.uid)}
                      className={`w-full text-left px-3 py-2 text-sm font-mono cursor-pointer ${uid === c.uid ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}
                    >
                      {c.uid}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <Button type="submit" className="w-full">Assign RFID</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ReloadWalletButton({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await reloadWallet({
        memberId,
        amount: Number(amount),
        referenceNumber: `ADMIN-${Date.now()}`,
      });
      setOpen(false);
      setAmount('');
      toast('Wallet reloaded');
      router.refresh();
    } catch {
      toast('Failed to reload wallet');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Reload
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reload Wallet — {memberId}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₱)</Label>
            <Input
              id="amount"
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
          <Button type="submit" className="w-full">Reload</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditMemberButton({ member }: { member: any }) {
  const [open, setOpen] = useState(false);
  const [firstName, setFirstName] = useState(member.first_name);
  const [lastName, setLastName] = useState(member.last_name);
  const [email, setEmail] = useState(member.email || '');
  const [status, setStatus] = useState<'Active' | 'Inactive' | 'Suspended'>(member.status);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateMember(member.id, {
        firstName,
        lastName,
        email: email || undefined,
        status,
      });
      setOpen(false);
      toast.success('Member updated successfully');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update member');
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" title="Edit Member" />}>
        <Pencil className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Member Details</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-firstName">First Name</Label>
            <Input
              id="edit-firstName"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-lastName">Last Name</Label>
            <Input
              id="edit-lastName"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-email">Email</Label>
            <Input
              id="edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-status">Status</Label>
            <select
              id="edit-status"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-emerald-500"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Suspended">Suspended</option>
            </select>
          </div>
          <Button type="submit" className="w-full mt-2">Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteMemberButton({ member }: { member: any }) {
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMember(member.id);
      setOpen(false);
      toast.success('Member deleted successfully');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete member');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="icon-sm" className="text-red-500 hover:text-red-400 hover:bg-red-500/10 border-red-500/20" title="Delete Member" />}>
        <Trash2 className="size-3.5" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Member</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-zinc-400">
            Are you sure you want to delete <span className="font-semibold text-zinc-200">{member.first_name} {member.last_name}</span>? 
            This will permanently remove their profile, wallet, and active RFID cards.
          </p>
          <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded p-2">
            Warning: Members with active game history cannot be deleted. If they have played games, please set their status to Inactive instead.
          </p>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Permanently Delete'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
