"use client";
import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { assignRFID } from "@/features/rfid/actions";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

export function AssignRFIDDialog() {
  const [open, setOpen] = useState(false);
  const [uid, setUid] = useState("");
  const [search, setSearch] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [isScanningNFC, setIsScanningNFC] = useState(false);
  const [nfcSupported, setNfcSupported] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const supabase = createClient();

  useEffect(() => {
    if (typeof window !== "undefined" && !("NDEFReader" in window)) {
      setNfcSupported(false);
    }
  }, []);

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
  }, [search]);

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
    if (!uid.trim()) { toast("Enter an RFID UID"); return; }
    try {
      await assignRFID({ uid: uid.trim(), memberId: selected?.id ?? null });
      setOpen(false);
      setUid("");
      setSearch("");
      setSelected(null);
      toast(selected ? "RFID assigned!" : "RFID added (unassigned)");
    } catch(err: any) {
      toast("Failed: " + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        Add RFID
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add RFID Card</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="uid">RFID UID</Label>
            <div className="flex gap-2">
              <Input id="uid" required value={uid} onChange={e => setUid(e.target.value)} placeholder="e.g. 04A1B2C3" />
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
          <div className="space-y-2">
            <Label>Assign to Member (optional)</Label>
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or ID..." />
            {searching && <p className="text-xs text-zinc-500">Searching...</p>}
            {members.length > 0 && (
              <div className="border rounded-md max-h-40 overflow-y-auto space-y-0.5">
                {members.map((m: any) => {
                  const fullName = `${m.first_name} ${m.last_name}`;
                  const isSelected = selected?.id === m.id;
                  return (
                    <button key={m.id} type="button" onClick={() => { setSelected({ id: m.id, name: fullName }); setSearch(fullName); setMembers([]); }}
                      className={`w-full text-left px-3 py-2 text-sm cursor-pointer ${isSelected ? 'bg-zinc-100' : 'hover:bg-zinc-50'}`}
                    >
                      <span className="font-medium">{fullName}</span>
                      <span className="text-zinc-400 ml-2">#{m.member_id}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {selected && (
              <p className="text-xs text-emerald-600">Assigned to: {selected.name}</p>
            )}
          </div>
          <Button type="submit" className="w-full">
            {selected ? 'Assign to Member' : 'Add Unassigned'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
