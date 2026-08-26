'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CourtGrid } from '@/components/bookings/CourtGrid';
import { TimeSlotGrid } from '@/components/bookings/TimeSlotGrid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface Court { id: string; name: string; status: string; }

export default function BookPage() {
  const router = useRouter();
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<Court | null>(null);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [slots, setSlots] = useState<{ time: string; available: boolean }[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [duration, setDuration] = useState(60);
  const [gameType, setGameType] = useState<'1v1' | '2v2'>('1v1');
  const [matchTitle, setMatchTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => {
    fetch('/api/courts/status').then(r => r.json()).then((data) => {
      setCourts(data.courts ?? []);
    });
  }, []);

  useEffect(() => {
    if (!selectedCourt) return;
    fetch(`/api/bookings/availability?courtId=${selectedCourt.id}&date=${date}`)
      .then(r => r.json())
      .then((data) => setSlots(data.slots ?? []));
  }, [selectedCourt, date]);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const start = `${date}T${selectedTime}:00.000Z`;
    const res = await fetch('/api/bookings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        courtId: selectedCourt?.id,
        start,
        duration,
        partySize: gameType === '2v2' ? 4 : 2,
        playerIds: [],
        matchTitle,
      }),
    });
    if (res.status === 401) { router.push(`/login?redirect=/book`); return; }
    if (!res.ok) { const data = await res.json(); setError(data.error); setLoading(false); return; }
    router.push('/bookings');
  }

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-8">
      <Card>
        <CardHeader><CardTitle>Select Court</CardTitle></CardHeader>
        <CardContent><CourtGrid courts={courts} selectedCourtId={selectedCourt?.id} onSelect={setSelectedCourt} /></CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Select Date</CardTitle></CardHeader>
        <CardContent>
          <input type="date" min={new Date().toISOString().split('T')[0]} max={maxDate} value={date} onChange={(e) => setDate(e.target.value)} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white" />
        </CardContent>
      </Card>

      {selectedCourt && (
        <Card>
          <CardHeader><CardTitle>Select Time</CardTitle></CardHeader>
          <CardContent><TimeSlotGrid slots={slots} selectedTime={selectedTime ?? undefined} onSelect={setSelectedTime} /></CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Details</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Duration</Label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white">
              <option value="30">30 min</option>
              <option value="60">60 min</option>
              <option value="90">90 min</option>
            </select>
          </div>
          <div>
            <Label>Game Type</Label>
            <select value={gameType} onChange={(e) => setGameType(e.target.value as '1v1' | '2v2')} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white">
              <option value="1v1">1v1 (2 players)</option>
              <option value="2v2">2v2 (4 players)</option>
            </select>
          </div>
          <div>
            <Label>Match Title (optional)</Label>
            <input value={matchTitle} onChange={(e) => setMatchTitle(e.target.value)} className="bg-white/10 border border-white/20 rounded px-3 py-2 text-white w-full" />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button onClick={handleConfirm} disabled={!selectedCourt || !selectedTime || loading} className="w-full">
            {loading ? 'Booking...' : 'Confirm Booking'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
