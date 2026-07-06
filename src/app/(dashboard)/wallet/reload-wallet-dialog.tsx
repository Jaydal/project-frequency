"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { reloadWallet } from "@/features/wallet/actions";
import { toast } from "sonner";

export function ReloadWalletDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ memberId: "", amount: "", referenceNumber: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await reloadWallet({ ...formData, amount: parseFloat(formData.amount) });
      setOpen(false);
      setFormData({ memberId: "", amount: "", referenceNumber: "" });
      toast("Wallet reloaded successfully!");
    } catch(err) {
      toast("Failed to reload wallet");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Reload Wallet</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reload Member Wallet</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memberId">Member ID</Label>
            <Input id="memberId" required value={formData.memberId} onChange={e => setFormData({ ...formData, memberId: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="amount">Amount (₱)</Label>
            <Input id="amount" type="number" required value={formData.amount} onChange={e => setFormData({ ...formData, amount: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referenceNumber">Reference Number (Optional)</Label>
            <Input id="referenceNumber" value={formData.referenceNumber} onChange={e => setFormData({ ...formData, referenceNumber: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Reload</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
