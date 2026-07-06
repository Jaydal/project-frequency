'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Step = 'scan' | 'players' | 'duration' | 'confirm' | 'queued' | 'offer' | 'done';

interface Player {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  balance: number;
}

interface QueueEntry {
  id: string;
  member_id: string;
  requested_start: string;
  duration: number;
  party_size: number;
  player_ids: string[];
  court_id: string | null;
  court_name?: string;
  status: string;
  expires_at: string | null;
  position?: number;
  estimatedWait?: string;
  created_at: string;
  updated_at: string;
}

interface OngoingGame {
  id: string;
  court_id: string;
  court_name: string;
  match_type: string;
  duration: number;
  status: string;
  start_time: string | null;
  players: Array<{ member_id: string; first_name: string; last_name: string }>;
}

interface QueueItem {
  id: string;
  member_id: string;
  first_name: string;
  last_name: string;
  party_size: number;
  duration: number;
  position: number;
  created_at: string;
}

const RATES: Record<string, number> = { '30': 150, '60': 300, '90': 450 };

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function TerminalPage() {
  const [step, setStep] = useState<Step>('scan');
  const [players, setPlayers] = useState<Player[]>([]);
  const [partySize, setPartySize] = useState(2);
  const [duration, setDuration] = useState(30);
  const [testMode, setTestMode] = useState(false);
  const [testPlayers, setTestPlayers] = useState<Player[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null);
  const [ongoingGames, setOngoingGames] = useState<OngoingGame[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [now, setNow] = useState(Date.now());
  const rfidRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setTestMode(params.get('testmode') === 'true');
    if (params.get('testmode') === 'true') fetchTestPlayers();
    fetchSidebar();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const channel = supabase.channel('sidebar');
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'games' },
      () => fetchSidebar()
    );
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries' },
      () => fetchSidebar()
    );
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  useEffect(() => {
    if (!queueEntry || !['waiting', 'offered'].includes(queueEntry.status)) return;

    const channel = supabase.channel(`queue-entry-${queueEntry.id}`);
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries',
        filter: `id=eq.${queueEntry.id}` },
      async (payload) => {
        const updated = payload.new as any;
        if (updated.status === 'offered') {
          setQueueEntry((prev) => prev ? {
            ...prev, status: 'offered', expires_at: updated.expires_at, court_id: updated.court_id,
          } : prev);
          setStep('offer');
        } else if (updated.status === 'completed') {
          let name: string | null = null;
          if (updated.court_id) {
            const { data: court } = await supabase.from('courts').select('name').eq('id', updated.court_id).single();
            name = court?.name ?? null;
          }
          setQueueEntry((prev) => prev ? { ...prev, status: 'completed', court_id: updated.court_id, court_name: name ?? undefined } : prev);
          setStep('done');
        } else if (['expired', 'declined', 'cancelled'].includes(updated.status)) {
          setQueueEntry((prev) => prev ? { ...prev, status: updated.status } : prev);
        }
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queueEntry?.id]);

  async function fetchTestPlayers() {
    setTestPlayers([
      { id: '550e8400-e29b-41d4-a716-446655440000', memberId: 'PB-TEST-001', firstName: 'Juan', lastName: 'Dela Cruz', balance: 99999 },
      { id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8', memberId: 'PB-TEST-002', firstName: 'Maria', lastName: 'Santos', balance: 500 },
      { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', memberId: 'PB-TEST-003', firstName: 'Jose', lastName: 'Rizal', balance: 500 },
      { id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', memberId: 'PB-TEST-004', firstName: 'Ana', lastName: 'Gonzales', balance: 500 },
      { id: '123e4567-e89b-12d3-a456-426614174000', memberId: 'PB-TEST-005', firstName: 'Pedro', lastName: 'Penduko', balance: 500 },
    ]);
  }

  const fetchSidebar = useCallback(async () => {
    const { data: ongoing } = await supabase
      .from('games')
      .select('id, court_id, match_type, duration, status, start_time, courts!inner(name), game_players(member_id, members!inner(first_name, last_name))')
      .in('status', ['In Progress', 'Scheduled'])
      .order('created_at', { ascending: true });

    if (ongoing) {
      setOngoingGames(ongoing.map((g: any) => ({
        id: g.id,
        court_id: g.court_id,
        court_name: g.courts?.name ?? '',
        match_type: g.match_type,
        duration: g.duration,
        status: g.status,
        start_time: g.start_time,
        players: (g.game_players ?? []).map((gp: any) => ({
          member_id: gp.member_id,
          first_name: gp.members?.first_name ?? '',
          last_name: gp.members?.last_name ?? '',
        })),
      })));
    }

    const { data: queue } = await supabase
      .from('queue_entries')
      .select('id, member_id, party_size, duration, created_at')
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(20);

    if (queue) {
      const items: QueueItem[] = await Promise.all(queue.map(async (q, i) => {
        const { data: member } = await supabase
          .from('members')
          .select('first_name, last_name')
          .eq('id', q.member_id)
          .single();
        return {
          id: q.id,
          member_id: q.member_id,
          first_name: member?.first_name ?? '?',
          last_name: member?.last_name ?? '',
          party_size: q.party_size,
          duration: q.duration,
          position: i + 1,
          created_at: q.created_at,
        };
      }));
      setQueueItems(items);
    }
  }, []);

  function focusRfid() {
    setTimeout(() => rfidRef.current?.focus(), 100);
  }

  async function handleRfidSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rfidRef.current) return;
    const uid = rfidRef.current.value.trim();
    rfidRef.current.value = '';
    if (!uid) return;

    setError('');
    try {
      const { data, error: err } = await supabase
        .from('rfid_cards')
        .select('uid, member_id, members!inner(id, member_id, first_name, last_name, wallets(balance))')
        .eq('uid', uid)
        .eq('status', 'Active')
        .single();

      if (err || !data) { setError('Invalid RFID'); focusRfid(); return; }

      const m = data.members as any;
      const member: Player = {
        id: m.id,
        memberId: m.member_id,
        firstName: m.first_name,
        lastName: m.last_name,
        balance: Array.isArray(m.wallets) ? (m.wallets[0]?.balance ?? 0) : (m.wallets?.balance ?? 0),
      };
      addPlayer(member);
    } catch { setError('Connection error'); focusRfid(); }
  }

  function addPlayer(member: Player) {
    if (players.find((p) => p.memberId === member.memberId)) {
      setError('Already added'); focusRfid();
      return;
    }
    const next = [...players, member];
    setPlayers(next);
    setError('');
    if (step === 'scan') setStep('players');
    checkPendingOffers(member.id);
  }

  async function checkPendingOffers(memberId: string) {
    const { data } = await supabase
      .from('queue_entries')
      .select('*')
      .eq('member_id', memberId)
      .eq('status', 'offered')
      .single();

    if (data) {
      setQueueEntry(data as QueueEntry);
      setStep('offer');
    }
  }

  function addTestPlayer(member: Player) {
    if (players.find((p) => p.memberId === member.memberId)) return;
    setPlayers([...players, member]);
    if (step === 'scan') setStep('players');
  }

  function removePlayer(memberId: string) {
    setPlayers((p) => p.filter((x) => x.memberId !== memberId));
  }

  const inferredPartySize = players.length >= 4 ? 4 : (players.length >= 2 ? partySize : 2);
  const totalNeeded = partySize;
  const chargePerPlayer = (RATES[String(duration)] * (duration / 30)) / (partySize === 4 ? 2 : 1);

  async function handleConfirm() {
    if (players.length === 0) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: players[0].id,
          start: new Date().toISOString(),
          duration,
          partySize,
          playerIds: players.map((p) => p.id),
        }),
      });

      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'Queue request failed');
        setBusy(false);
        return;
      }

      const entry: QueueEntry = await res.json();
      setQueueEntry(entry);

      if (entry.status === 'completed') {
        setStep('done');
      } else if (entry.status === 'offered') {
        setStep('offer');
      } else {
        setStep('queued');
      }
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  async function handleAcceptOffer() {
    if (!queueEntry) return;
    setBusy(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: queueEntry.id, action: 'accept' }),
      });
      if (!res.ok) {
        const body = await res.json();
        setError(body.error ?? 'Accept failed');
        setBusy(false);
        return;
      }
      const data = await res.json();
      setQueueEntry((prev) => prev ? { ...prev, status: 'completed', court_name: data.courtName } : prev);
      setStep('done');
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  async function handleDeclineOffer() {
    if (!queueEntry) return;
    setBusy(true);
    try {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: queueEntry.id, action: 'decline' }),
      });
      reset();
    } catch {
      setError('Network error');
    }
    setBusy(false);
  }

  function reset() {
    setPlayers([]); setPartySize(2); setDuration(30);
    setQueueEntry(null); setStep('scan'); setError(''); focusRfid();
  }

  const offerRemaining = queueEntry?.expires_at
    ? Math.max(0, Math.floor((new Date(queueEntry.expires_at).getTime() - now) / 1000))
    : 0;

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm p-6">
          {step === 'scan' && (
            <>
              <div className="text-5xl mb-4 text-center">🏓</div>
              <h1 className="text-3xl font-bold text-center mb-2">TAP RFID CARD</h1>
              <p className="text-gray-500 text-center mb-8">Scan your card to start</p>
              {testMode ? (
                <div className="grid grid-cols-2 gap-3 max-w-sm mx-auto">
                  {testPlayers.map((p) => (
                    <button key={p.memberId} onClick={() => addTestPlayer(p)}
                      className="bg-white border-2 border-gray-200 rounded-xl p-5 text-center active:border-blue-500 cursor-pointer"
                    >
                      <div className="text-lg font-bold">{p.firstName}</div>
                      <div className="text-xs text-gray-500">{p.lastName}</div>
                      <div className="text-sm font-semibold mt-1 text-green-700">₱{Number(p.balance).toLocaleString()}</div>
                    </button>
                  ))}
                </div>
              ) : (
                <form onSubmit={handleRfidSubmit} className="text-center">
                  <input ref={rfidRef} type="text" autoFocus
                    className="w-64 h-12 text-center text-lg border-2 border-gray-300 rounded-xl outline-none focus:border-blue-500 bg-white"
                    placeholder="Scan card here..."
                  />
                  <button type="submit" hidden />
                </form>
              )}
              {error && <p className="text-red-600 text-center mt-4">{error}</p>}
            </>
          )}

          {step === 'players' && (
            <>
              <h1 className="text-2xl font-bold text-center mb-6">PLAYERS</h1>
              <div className="space-y-3 mb-6 max-w-sm mx-auto">
                {players.map((p) => (
                  <div key={p.memberId} className="bg-white border rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <span className="font-semibold">{p.firstName} {p.lastName}</span>
                      <span className="ml-3 text-sm text-green-700">₱{Number(p.balance).toLocaleString()}</span>
                    </div>
                    <button onClick={() => removePlayer(p.memberId)} className="text-red-500 text-sm px-2 cursor-pointer">Remove</button>
                  </div>
                ))}
              </div>
              <div className="flex flex-col items-center gap-3">
                <button onClick={() => { setStep('scan'); focusRfid(); }}
                  className="px-8 py-3 bg-gray-100 rounded-xl text-lg font-medium active:bg-gray-200 cursor-pointer"
                >Add Player ({players.length}/{partySize})</button>
                <button onClick={() => setStep('duration')}
                  disabled={players.length < 1}
                  className="px-10 py-4 bg-blue-600 text-white rounded-2xl text-xl font-bold disabled:opacity-40 active:bg-blue-700 cursor-pointer disabled:cursor-default"
                >Next</button>
              </div>
            </>
          )}

          {step === 'duration' && (
            <>
              <h1 className="text-2xl font-bold text-center mb-6">PARTY SIZE &amp; DURATION</h1>
              <div className="flex justify-center gap-4 mb-6">
                <button onClick={() => setPartySize(2)}
                  className={`w-28 border-2 rounded-xl p-4 text-center cursor-pointer ${partySize === 2 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} active:border-blue-500`}
                >
                  <div className="text-2xl font-bold">2</div>
                  <div className="text-xs text-gray-500">Players (1v1)</div>
                </button>
                <button onClick={() => setPartySize(4)}
                  className={`w-28 border-2 rounded-xl p-4 text-center cursor-pointer ${partySize === 4 ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} active:border-blue-500`}
                >
                  <div className="text-2xl font-bold">4</div>
                  <div className="text-xs text-gray-500">Players (2v2)</div>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
                {[30, 60, 90].map((d) => {
                  const total = RATES[String(d)] * (d / 30);
                  const perPlayer = partySize === 4 ? total / 2 : total;
                  return (
                    <button key={d} onClick={() => { setDuration(d); setStep('confirm'); }}
                      className={`bg-white border-2 rounded-xl p-5 text-center cursor-pointer ${duration === d ? 'border-blue-500 bg-blue-50' : 'border-gray-200'} active:border-blue-500`}
                    >
                      <div className="text-xl font-bold">{d}</div>
                      <div className="text-xs text-gray-500">min</div>
                      <div className="text-sm font-semibold mt-1 text-blue-700">₱{perPlayer}</div>
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setStep('players')} className="block mx-auto mt-6 text-gray-500 underline text-sm cursor-pointer">Back</button>
            </>
          )}

          {step === 'confirm' && (
            <>
              <h1 className="text-2xl font-bold text-center mb-6">CONFIRM</h1>
              <div className="space-y-3 mb-6 max-w-sm mx-auto">
                <SummaryRow label="Players" value={`${partySize} (${partySize === 4 ? '2v2' : '1v1'})`} />
                <SummaryRow label="Duration" value={`${duration} min`} />
                <div className="bg-white border rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-2">Players</div>
                  {players.map((p) => (
                    <div key={p.memberId} className="flex justify-between py-1">
                      <span>{p.firstName} {p.lastName}</span>
                      <span className={Number(p.balance) >= chargePerPlayer ? 'text-green-700' : 'text-red-600'}>₱{Number(p.balance).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="text-xs text-gray-500">Charge per player</div>
                  <div className="text-2xl font-bold text-blue-700">₱{chargePerPlayer}</div>
                </div>
              </div>
              {error && <p className="text-red-600 text-center mb-4">{error}</p>}
              <div className="flex gap-4 justify-center">
                <button onClick={() => setStep('duration')} className="px-8 py-3 bg-gray-100 rounded-xl text-lg cursor-pointer">Back</button>
                <button onClick={handleConfirm} disabled={busy}
                  className="px-10 py-3 bg-green-600 text-white rounded-xl text-lg font-bold disabled:opacity-40 active:bg-green-700 cursor-pointer disabled:cursor-default"
                >{busy ? 'Registering...' : 'Confirm'}</button>
              </div>
            </>
          )}

          {step === 'queued' && queueEntry && (
            <>
              <div className="text-6xl mb-4 text-center">⏳</div>
              <h1 className="text-3xl font-bold text-center mb-2">IN QUEUE</h1>
              <div className="text-center mb-2">
                <span className="text-5xl font-bold text-yellow-600">{queueEntry.position ?? '?'}</span>
                <span className="text-xl text-gray-500 ml-2">in line</span>
              </div>
              <p className="text-center text-gray-600 mb-1">{queueEntry.duration} min · {queueEntry.party_size} Players</p>
              <p className="text-center text-gray-500 mb-8">Est. wait: {queueEntry.estimatedWait ?? '~60 min'}</p>
              {queueEntry.status === 'expired' && (
                <div className="text-center mb-4">
                  <p className="text-red-600 font-semibold">Offer expired</p>
                  <button onClick={reset} className="mt-2 text-blue-600 underline cursor-pointer">Return to start</button>
                </div>
              )}
              {queueEntry.status === 'declined' && (
                <div className="text-center mb-4">
                  <p className="text-orange-600 font-semibold">Offer declined</p>
                  <button onClick={reset} className="mt-2 text-blue-600 underline cursor-pointer">Return to start</button>
                </div>
              )}
              {queueEntry.status === 'cancelled' && (
                <div className="text-center mb-4">
                  <p className="text-gray-600">Queue entry cancelled</p>
                  <button onClick={reset} className="mt-2 text-blue-600 underline cursor-pointer">New Registration</button>
                </div>
              )}
              {queueEntry.status === 'waiting' && (
                <button onClick={reset}
                  className="block mx-auto px-10 py-4 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700 cursor-pointer"
                >New Registration</button>
              )}
            </>
          )}

          {step === 'offer' && queueEntry && (
            <>
              <div className="text-6xl mb-4 text-center">🎯</div>
              <h1 className="text-3xl font-bold text-center mb-2">COURT AVAILABLE!</h1>
              <p className="text-center text-gray-600 mb-2">{queueEntry.duration} min · {queueEntry.party_size} Players</p>
              <div className="text-center mb-6">
                <div className="text-5xl font-mono font-bold text-amber-600">
                  {Math.floor(offerRemaining / 60)}:{String(offerRemaining % 60).padStart(2, '0')}
                </div>
                <p className="text-sm text-gray-500">remaining to confirm</p>
              </div>
              {offerRemaining <= 0 ? (
                <div className="text-center">
                  <p className="text-red-600 font-semibold mb-4">Offer expired</p>
                  <button onClick={reset} className="px-10 py-4 bg-blue-600 text-white rounded-2xl text-xl font-bold cursor-pointer">New Registration</button>
                </div>
              ) : (
                <div className="flex gap-4 justify-center">
                  <button onClick={handleDeclineOffer} disabled={busy}
                    className="px-8 py-3 bg-gray-100 rounded-xl text-lg cursor-pointer disabled:opacity-40"
                  >Decline</button>
                  <button onClick={handleAcceptOffer} disabled={busy}
                    className="px-10 py-3 bg-green-600 text-white rounded-xl text-lg font-bold disabled:opacity-40 active:bg-green-700 cursor-pointer disabled:cursor-default"
                  >{busy ? 'Accepting...' : 'Accept & Book'}</button>
                </div>
              )}
              {error && <p className="text-red-600 text-center mt-4">{error}</p>}
            </>
          )}

          {step === 'done' && (
            <>
              <div className="text-6xl mb-4 text-center">✅</div>
              <h1 className="text-3xl font-bold text-center mb-2">BOOKING CONFIRMED!</h1>
              <p className="text-center text-gray-600 mb-1">{queueEntry?.court_name ?? 'Court assigned'}</p>
              <p className="text-center text-gray-500 mb-8">{duration} min · ₱{chargePerPlayer} each</p>
              <button onClick={reset}
                className="block mx-auto px-10 py-4 bg-blue-600 text-white rounded-2xl text-xl font-bold active:bg-blue-700 cursor-pointer"
              >New Registration</button>
            </>
          )}

          <div className="text-center mt-8">
            <PlayerBadges players={players} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
              LIVE — ONGOING
            </h2>
            {ongoingGames.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">No active games</p>
            ) : (
              <div className="space-y-3">
                {ongoingGames.map((g) => {
                  const elapsed = g.start_time
                    ? Math.floor((now - new Date(g.start_time).getTime()) / 1000)
                    : 0;
                  const remaining = Math.max(0, g.duration * 60 - elapsed);
                  const pct = g.duration > 0 ? (elapsed / (g.duration * 60)) * 100 : 0;
                  return (
                    <div key={g.id} className="bg-gray-50 rounded-xl p-4 border-l-4 border-green-500">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-bold text-lg">{g.court_name}</div>
                          <div className="text-sm text-gray-500">{g.match_type}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-mono font-bold text-green-600">{formatTime(elapsed)}</div>
                          <div className="text-xs text-gray-400">{formatTime(remaining)} remaining</div>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                        <div className="h-2 rounded-full bg-green-500 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                      <div className="text-xs text-gray-600 space-y-0.5">
                        {g.players.slice(0, 2).map((p) => (
                          <div key={p.member_id}>{p.first_name} {p.last_name}</div>
                        ))}
                        {g.players.length > 2 && <div className="text-gray-400">+{g.players.length - 2} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl shadow-sm p-5">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-yellow-400 rounded-full" />
              QUEUE
            </h2>
            {queueItems.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6">Queue is empty</p>
            ) : (
              <div className="space-y-2">
                {queueItems.map((q) => (
                  <div key={q.id} className="bg-gray-50 rounded-xl p-3 border-l-4 border-yellow-400 flex items-center gap-3">
                    <div className="w-8 h-8 bg-yellow-100 rounded-full flex items-center justify-center font-bold text-yellow-700 text-sm shrink-0">
                      {q.position}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">{q.first_name} {q.last_name}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {q.party_size} Players · {q.duration}min
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlayerBadges({ players }: { players: Player[] }) {
  if (players.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {players.map((p) => (
        <span key={p.memberId} className="inline-block bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
          {p.firstName} ₱{Number(p.balance).toLocaleString()}
        </span>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border rounded-xl p-4 flex justify-between items-center">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-xl font-bold">{value}</span>
    </div>
  );
}
