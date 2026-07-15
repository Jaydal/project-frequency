'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { P10Display } from '@/components/display/P10Display';
import { Card, CardContent } from '@/components/ui/card';

export default function VirtualDisplaysPage() {
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [display, setDisplay] = useState<any>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const supabase = createClient();
  const viewerId = useMemo(() => Math.random().toString(36).slice(2, 10), []);

  useEffect(() => {
    supabase.from('courts').select('id, name').order('name').then(({ data }) => {
      if (data) setCourts(data);
    });
  }, [supabase]);

  useEffect(() => {
    if (!selected) { setDisplay(null); return; }

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
        fetch('/api/display/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ viewerId, courtId: selected }),
        }).catch(() => {});
      } catch {}
    };

    fetchDisplay();
    const id = setInterval(fetchDisplay, 2000);
    return () => clearInterval(id);
  }, [selected, viewerId]);

  const selectedCourt = courts.find(c => c.id === selected || c.name === selected);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-150">Display Monitor</h1>
          <p className="text-sm text-zinc-500 mt-1">Virtual representation and simulation of the physical court scoreboards</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 bg-zinc-950 p-1 border border-zinc-850 rounded-lg">
            <button 
              onClick={() => setLayout('horizontal')}
              className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                layout === 'horizontal' ? 'bg-zinc-900 text-emerald-400 font-black' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Horizontal
            </button>
            <button 
              onClick={() => setLayout('vertical')}
              className={`text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                layout === 'vertical' ? 'bg-zinc-900 text-emerald-400 font-black' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              Vertical
            </button>
          </div>
          <span className={`text-[10px] uppercase font-black tracking-wider px-2.5 py-1.5 rounded-lg border shrink-0 ${
            connected 
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]' 
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            MQTT {connected ? 'Connected' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="w-full max-w-md">
        <label className="text-xs font-bold uppercase tracking-wider text-zinc-500 block mb-1.5">Select Court Matrix</label>
        <Select value={selected} onValueChange={(v: string | null) => { if (v) setSelected(v); }}>
          <SelectTrigger className="bg-zinc-900/30 border-zinc-800 text-zinc-200">
            <SelectValue placeholder="Choose a court display..." />
          </SelectTrigger>
          <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-200">
            {courts.map(c => (
              <SelectItem key={c.id} value={c.id} className="hover:bg-zinc-900 cursor-pointer">{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <Card className="border-zinc-800 bg-zinc-900/30 overflow-hidden max-w-xl">
          <div className="px-5 py-4 border-b border-zinc-800/50 bg-zinc-950/20 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`size-2 rounded-full ${display ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.4)]' : 'bg-zinc-600'}`} />
              <span className="font-bold text-zinc-200">{selectedCourt?.name ?? selected}</span>
            </div>
            {status && (
              <span className="text-[10px] font-black uppercase tracking-wider">
                ESP32: <span className={status === 'online' ? 'text-emerald-400' : 'text-red-400'}>{status}</span>
              </span>
            )}
          </div>
          <CardContent className="p-6 flex flex-col items-center gap-4 bg-zinc-950/40">
            <div className="w-full">
              {display ? (
                <P10Display pages={display.display?.pages || display.pages} layout={layout} />
              ) : (
                <P10Display pages={[{ text: 'NO DISPLAY DATA', color: '#ff0000', effect: 'STATIC' }]} layout={layout} />
              )}
            </div>
            <p className="text-[9px] font-mono text-zinc-600 text-center uppercase tracking-widest mt-2">
              Topic: courts/{selected}/display
            </p>
          </CardContent>
        </Card>
      )}

      {!selected && (
        <Card className="border-zinc-800 bg-zinc-900/10 border-dashed max-w-xl py-12 text-center text-zinc-500">
          <p className="text-sm font-semibold text-zinc-400">No screen selected</p>
          <p className="text-xs mt-1 text-zinc-500">Select a court matrix from the dropdown above to view its live LED display output.</p>
        </Card>
      )}
    </div>
  );
}
