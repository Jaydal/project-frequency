'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { P10Display } from '@/components/display/P10Display';
import { effectivePrepSec } from '@/lib/products-config-types';

type DisplayPayload = { line1: string; line2: string; line3: string };

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function VirtualDisplaysPage() {
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState('');
  const [display, setDisplay] = useState<DisplayPayload | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [gameInfo, setGameInfo] = useState<{ startTime: string; duration: number; prepTimeSec: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [layout, setLayout] = useState<'horizontal' | 'vertical'>('horizontal');
  const supabase = createClient();
  const viewerId = useMemo(() => Math.random().toString(36).slice(2, 10), []);

  useEffect(() => {
    supabase.from('courts').select('id, name').order('name').then(({ data }) => {
      if (data) setCourts(data);
    });
  }, []);

  // Tick every second for local countdown
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Poll server display state every 2s + send heartbeat
  useEffect(() => {
    if (!selected) { setDisplay(null); setGameInfo(null); return; }

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
        setGameInfo(state.game ?? null);
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
  }, [selected]);

  // Compute live display with local countdown
  const liveDisplay = useMemo(() => {
    if (!display || !gameInfo) return display;

    const elapsed = Math.floor((now - new Date(gameInfo.startTime).getTime()) / 1000);
    const prep = effectivePrepSec(gameInfo.duration, gameInfo.prepTimeSec);
    const totalSec = gameInfo.duration * 60 + prep;

    if (elapsed < prep) {
      return { ...display, line2: `GAME ${fmt(prep - elapsed)}` };
    } else if (elapsed < totalSec) {
      return { ...display, line2: `${fmt(totalSec - elapsed)} LEFT` };
    }
    return display;
  }, [display, gameInfo, now]);

  const selectedCourt = courts.find(c => c.id === selected || c.name === selected);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Court Display Monitor</h1>
        <div className="flex items-center gap-2">
          <button onClick={() => setLayout('horizontal')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              layout === 'horizontal' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Horizontal
          </button>
          <button onClick={() => setLayout('vertical')}
            className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
              layout === 'vertical' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'
            }`}
          >
            Vertical
          </button>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full shrink-0 ${
          connected ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
        }`}>
          MQTT {connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      <div className="w-full max-w-md">
        <label className="text-sm font-medium text-foreground block mb-1.5">Select a court to monitor</label>
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
        <div className="w-full flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <span className={`size-2 rounded-full ${liveDisplay ? 'bg-emerald-400' : 'bg-muted-foreground'}`} />
            <span className="text-sm font-medium text-foreground">{selectedCourt?.name ?? selected}</span>
          </div>
          <div className="w-full max-w-md mx-auto">
            {liveDisplay ? (
              <P10Display line1={liveDisplay.line1} line2={liveDisplay.line2} line3={liveDisplay.line3} layout={layout} />
            ) : (
              <P10Display line1="" line2="NO DISPLAY" line3="DATA" layout={layout} />
            )}
          </div>
          <p className="text-[10px] text-center" style={{ color: '#ff3a00', opacity: 0.3 }}>
            courts/{selected}/display{gameInfo && ' · countdown live'}
          </p>

          {status && (
            <p className="text-xs text-muted-foreground text-center">
              ESP32: <span className={status === 'online' ? 'text-emerald-400' : 'text-red-400'}>{status}</span>
            </p>
          )}
        </div>
      )}

      {!selected && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-lg">Select a court above to view its display output</p>
          <p className="text-sm mt-1">Each court can have multiple display subscribers</p>
        </div>
      )}
    </div>
  );
}
