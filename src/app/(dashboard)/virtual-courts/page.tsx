'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type DisplayPayload = {
  line1: string;
  line2: string;
  line3: string;
};

export default function VirtualCourtsPage() {
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [display, setDisplay] = useState<DisplayPayload | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const supabase = createClient();
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    supabase.from('courts').select('id, name').order('name').then(({ data }) => {
      if (data) setCourts(data);
    });
  }, []);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!selected) { setDisplay(null); setStatus(null); return; }

    const fetchDisplay = async () => {
      try {
        const [stateRes, mqttRes] = await Promise.all([
          fetch(`/api/display/state/${encodeURIComponent(selected)}`),
          fetch('/api/mqtt'),
        ]);
        const state = await stateRes.json();
        const mqtt = await mqttRes.json();
        setConnected(mqtt.connected);
        setDisplay(state.display);
        setStatus(state.status?.status ?? null);
        setConnected(mqtt.connected);
      } catch {}
    };

    fetchDisplay();
    intervalRef.current = setInterval(fetchDisplay, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [selected]);

  const selectedCourt = courts.find(c => c.id === selected || c.name === selected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Court Display Monitor</h1>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
          MQTT {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="max-w-md">
        <label className="text-sm font-medium text-zinc-300 block mb-1.5">Select a court to monitor</label>
        <Select value={selected} onValueChange={(v: string | null) => { if (v) setSelected(v); }}>
          <SelectTrigger>
            <SelectValue placeholder="Choose a court..." />
          </SelectTrigger>
          <SelectContent>
            {courts.map(c => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <div className="max-w-lg mx-auto space-y-4">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <span className={`size-2 rounded-full ${display ? 'bg-emerald-400' : 'bg-zinc-600'}`} />
                {selectedCourt?.name ?? selected}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {display ? (
                <div className="space-y-2" style={{ fontFamily: "'Courier New', monospace" }}>
                  {[display.line1, display.line2, display.line3].map((line, i) => (
                    <div key={i}
                      className="bg-black border border-zinc-700 rounded-lg px-6 py-4 text-zinc-100 text-center text-lg tracking-widest"
                      style={{ minHeight: '3rem', lineHeight: '1.75rem' }}
                    >
                      {line || ''}
                    </div>
                  ))}
                  <p className="text-[10px] text-zinc-600 text-center pt-1">courts/{selected}/display &bull; refreshing every 2s</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {[0, 1, 2].map(i => (
                    <div key={i}
                      className="bg-black border border-zinc-800 rounded-lg px-6 py-4 text-zinc-700 text-center text-lg"
                      style={{ minHeight: '3rem', lineHeight: '1.75rem' }}
                    >
                      &mdash;
                    </div>
                  ))}
                  <p className="text-xs text-zinc-500 text-center pt-1">No display data received yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {status && (
            <p className="text-xs text-zinc-600 text-center">
              ESP32 status: <span className={status === 'online' ? 'text-emerald-400' : 'text-red-400'}>{status}</span>
            </p>
          )}
        </div>
      )}

      {!selected && (
        <div className="text-center py-16 text-zinc-500">
          <p className="text-lg">Select a court above to view its display output</p>
          <p className="text-sm mt-1">Each court can have multiple display subscribers</p>
        </div>
      )}
    </div>
  );
}
