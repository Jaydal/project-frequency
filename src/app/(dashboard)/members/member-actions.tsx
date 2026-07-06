'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { assignRFID } from '@/features/rfid/actions';
import { reloadWallet } from '@/features/wallet/actions';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

export function AssignRfidButton({ memberId }: { memberId: string }) {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState('');
  const router = useRouter();

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
      <DialogTrigger>
        <Button variant="outline" size="sm">Assign RFID</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign RFID to {memberId}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="uid">RFID UID</Label>
            <Input
              id="uid"
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              required
              placeholder="Tap NFC tag"
              className="font-mono"
            />
          </div>
          <Button type="submit" className="w-full">Assign</Button>
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
      <DialogTrigger>
        <Button variant="outline" size="sm">Reload</Button>
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
