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
