"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMember } from "@/features/members/actions";
import { toast } from "sonner";

export function AddMemberDialog() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({ memberId: "", firstName: "", lastName: "", email: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createMember(formData);
      setOpen(false);
      setFormData({ memberId: "", firstName: "", lastName: "", email: "" });
      toast("Member created successfully!");
    } catch(err) {
      toast("Failed to create member");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Member</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="memberId">Member ID</Label>
            <Input id="memberId" required value={formData.memberId} onChange={e => setFormData({ ...formData, memberId: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="firstName">First Name</Label>
            <Input id="firstName" required value={formData.firstName} onChange={e => setFormData({ ...formData, firstName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last Name</Label>
            <Input id="lastName" required value={formData.lastName} onChange={e => setFormData({ ...formData, lastName: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <Button type="submit" className="w-full">Create Member</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
