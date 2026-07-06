"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignRFID } from "@/features/rfid/actions";
import { toast } from "sonner";

export function AssignRFIDDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ memberId: "", uid: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await assignRFID(formData);
      setOpen(false);
      setFormData({ memberId: "", uid: "" });
      toast("RFID assigned successfully!");
    } catch(err: any) {
      toast("Failed: " + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger>
        <Button>Assign RFID</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign RFID to Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memberId">Member ID</Label>
            <Input id="memberId" required value={formData.memberId} onChange={e => setFormData({ ...formData, memberId: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uid">RFID UID</Label>
            <Input id="uid" required value={formData.uid} onChange={e => setFormData({ ...formData, uid: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Assign</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
