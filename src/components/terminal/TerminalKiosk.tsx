'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TerminalLayout } from './TerminalLayout';
import { CourtOverview } from './CourtOverview';
import { IdleScreen } from './IdleScreen';
import { SelectCourt } from './SelectCourt';
import { SelectGameType } from './SelectGameType';
import { SelectDuration } from './SelectDuration';
import { ConfirmBooking } from './ConfirmBooking';
import { QueueBoard } from './QueueBoard';
import { ReservationOffer } from './ReservationOffer';
import { BookingSuccess } from './BookingSuccess';
import { ErrorScreen } from './ErrorScreen';
import type { ProductsConfig } from '@/lib/products-config-types';
import { getCost } from '@/lib/products-config-types';
import { processExpiredGames, processAvailableCourts, processExpiredOffers } from '@/lib/complete-expired-games';

interface Player {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  balance: number;
}

interface CourtOption {
  id: string;
  name: string;
  status: string;
  estimatedWait?: string;
}

export type KioskStep =
  | 'idle'
  | 'existing-queue'
  | 'select-court'
  | 'select-game'
  | 'select-duration'
  | 'confirm'
  | 'offer'
  | 'success'
  | 'error';


const SUCCESS_DELAY_MS = 5000;

export function TerminalKiosk() {
  const [step, setStep] = useState<KioskStep>('idle');
  const [member, setMember] = useState<Player | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<CourtOption | null>(null);
  const [gameType, setGameType] = useState<'1v1' | '2v2' | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [matchTitle, setMatchTitle] = useState('');
  const [queueEntry, setQueueEntry] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string } | null>(null);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [testMode, setTestMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [config, setConfig] = useState<ProductsConfig | null>(null);
  const rfidRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isTest = new URLSearchParams(window.location.search).get('testmode') === 'true';
    setTestMode(isTest);
  }, []);

  useEffect(() => {
    if (step === 'idle' && !testMode) {
      setTimeout(() => rfidRef.current?.focus(), 200);
    }
  }, [step, testMode]);

  useEffect(() => {
    if (step === 'success') {
      successTimer.current = setTimeout(() => reset(), SUCCESS_DELAY_MS);
      return () => { if (successTimer.current) clearTimeout(successTimer.current); };
    }
    if (step === 'select-court') {
      fetchCourts();
    }
  }, [step]);

  useEffect(() => {
    if (!queueEntry) return;
    const channel = supabase.channel(`kiosk-${queueEntry.id}`);
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: `id=eq.${queueEntry.id}` },
      async (payload) => {
        const updated = payload.new as any;
        if (successTimer.current) clearTimeout(successTimer.current);
        if (updated.status === 'offered') {
          setQueueEntry((prev: any) => prev ? { ...prev, status: 'offered', expires_at: updated.expires_at, court_id: updated.court_id } : prev);
          setStep('offer');
        } else if (updated.status === 'completed') {
          setQueueEntry((prev: any) => prev ? { ...prev, status: 'completed' } : prev);
          setStep('success');
        } else if (['expired', 'declined', 'cancelled'].includes(updated.status)) {
          setQueueEntry((prev: any) => prev ? { ...prev, status: updated.status } : prev);
          setStep('idle');
        }
      }
    ).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queueEntry?.id]);

  useEffect(() => {
    fetchInitial();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await processExpiredOffers();
      await processExpiredGames();
      if (!cancelled) await processAvailableCourts();
      if (!cancelled) await fetchCourts();
    };
    run();
    const id = setInterval(run, 10_000);
    const realtime = supabase.channel('kiosk-processor');
    realtime.on('postgres_changes',
      { event: '*', schema: 'public', table: 'games' },
      () => { if (!cancelled) { processExpiredOffers(); processAvailableCourts(); fetchCourts(); } }
    );
    realtime.on('postgres_changes',
      { event: '*', schema: 'public', table: 'courts' },
      () => { if (!cancelled) { processExpiredOffers(); processAvailableCourts(); fetchCourts(); } }
    );
    realtime.subscribe();
    return () => { cancelled = true; clearInterval(id); supabase.removeChannel(realtime); };
  }, []);

  async function fetchInitial() {
    const { data: rows } = await supabase.from('settings').select('key, value').in('key', ['products', 'prices', 'preparationTime']);
    if (rows) {
      const map = new Map(rows.map(r => [r.key, r.value]));
      const products = tryParse(map.get('products'));
      const rates = tryParse(map.get('prices'));
      const prepTimeSec = parseInt(map.get('preparationTime') ?? '', 10);
      setConfig({
        matchTypes: products?.matchTypes ?? ['1v1', '2v2'],
        durations: products?.durations ?? [30, 60, 90],
        rates: rates ?? { '30': 150, '60': 300, '90': 450 },
        prepTimeSec: isNaN(prepTimeSec) ? 300 : prepTimeSec,
      });
    }
    await fetchCourts();
  }

  function tryParse(json: string | undefined): any {
    if (!json) return undefined;
    try { return JSON.parse(json); } catch { return undefined; }
  }

  async function fetchCourts() {
    const { data: games } = await supabase
      .from('games')
      .select('id, court_id, duration, status, start_time')
      .in('status', ['In Progress', 'Scheduled']);
    const { data: allCourts } = await supabase
      .from('courts')
      .select('*')
      .order('name');
    if (!allCourts) return;
    const busyIds = new Set((games ?? []).map((g: any) => g.court_id));
    setCourts(allCourts.map((c: any) => ({
      id: c.id,
      name: c.name,
      status: busyIds.has(c.id) ? 'Playing' : (c.status === 'Available' ? 'Available' : c.status),
    })));
  }

  function focusRfid() {
    setTimeout(() => rfidRef.current?.focus(), 200);
  }

  async function handleRfidSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!rfidRef.current) return;
    const uid = rfidRef.current.value.trim();
    rfidRef.current.value = '';
    if (!uid) return;
    await lookupMember(uid === 'test' ? 'TEST001' : uid);
  }

  async function lookupMember(uid: string) {
    setErrorInfo(null);
    try {
      const { data: card, error: err } = await supabase
        .from('rfid_cards')
        .select('member_id')
        .eq('uid', uid)
        .eq('status', 'Active')
        .single();
      if (err || !card) { setErrorInfo({ title: 'RFID Read Failed', message: 'Card not recognized. Please try again.' }); setStep('error'); return; }
      const { data: memberData, error: memberErr } = await supabase
        .from('members')
        .select('id, member_id, first_name, last_name')
        .eq('id', card.member_id)
        .single();
      if (memberErr || !memberData) { setErrorInfo({ title: 'RFID Read Failed', message: 'Card not recognized. Please try again.' }); setStep('error'); return; }
      const { data: walletData } = await supabase
        .from('wallets')
        .select('balance')
        .eq('member_id', memberData.id)
        .single();
      const player: Player = {
        id: memberData.id,
        memberId: memberData.member_id,
        firstName: memberData.first_name,
        lastName: memberData.last_name,
        balance: walletData?.balance ?? 0,
      };
      setMember(player);
      await checkExistingQueue(player.id);
    } catch { setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' }); setStep('error'); }
  }

  async function checkExistingQueue(memberId: string) {
    // Check if member has an active game
    const { data: activeGame } = await supabase
      .from('games')
      .select('id, court_id, status, start_time, duration, courts!inner(name)')
      .eq('status', 'In Progress')
      .eq('game_players.member_id', memberId)
      .maybeSingle();
    if (activeGame) {
      setErrorInfo({ title: 'Already Playing', message: `You are currently playing on ${(activeGame as any).courts?.name ?? 'a court'}. Finish your game first.` });
      setStep('error');
      return;
    }

    const { data } = await supabase
      .from('queue_entries')
      .select('id, status, court_id, expires_at, courts!left(name)')
      .eq('member_id', memberId)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data && data.status === 'offered') { setQueueEntry(data as any); setStep('offer'); return; }
    if (data && data.status === 'waiting') { setQueueEntry(data as any); setStep('existing-queue'); return; }
    setStep('select-court');
  }

  function handleSelectCourt(court: CourtOption) {
    setSelectedCourt(court);
    setStep('select-game');
  }

  function handleSelectGame(gt: '1v1' | '2v2') {
    setGameType(gt);
    setStep('select-duration');
  }

  function handleSelectDuration(d: number) {
    setDuration(d);
    setStep('confirm');
  }

  async function handleJoinQueue() {
    if (!member || !duration || !gameType) return;
    setBusy(true);
    setErrorInfo(null);
    if (!config) return;
    const partySize = gameType === '2v2' ? 4 : 2;
    const cost = getCost(config, duration, partySize);
    if (member.balance < cost) {
      setErrorInfo({ title: 'No Credits Remaining', message: `You need ₱${cost} but only have ₱${member.balance}.` });
      setStep('error');
      setBusy(false);
      return;
    }
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: member.id,
          start: new Date().toISOString(),
          duration,
          partySize,
          playerIds: [member.id],
          ...(selectedCourt?.id ? { courtId: selectedCourt.id } : {}),
          matchTitle: matchTitle || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        setErrorInfo({ title: 'Unable to Join Queue', message: body.error || 'Please try again.' });
        setStep('error');
        setBusy(false);
        return;
      }
      const entry = await res.json();
      setQueueEntry(entry);
      if (entry.status === 'completed') {
        const remaining = member.balance - cost;
        setMember(prev => prev ? { ...prev, balance: remaining } : prev);
        setStep('success');
      } else {
        setQueueEntry(entry);
        setStep('success');
        successTimer.current = setTimeout(() => reset(), 3000);
      }
    } catch {
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' });
      setStep('error');
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
        setErrorInfo({ title: 'Accept Failed', message: body.error || 'Please try again.' });
        setStep('error');
        setBusy(false);
        return;
      }
      const cost = config && duration ? getCost(config, duration, gameType === '2v2' ? 4 : 2) : 0;
      setMember(prev => prev ? { ...prev, balance: prev.balance - cost } : prev);
      setStep('success');
    } catch {
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' });
      setStep('error');
    }
    setBusy(false);
  }

  async function handleDeclineOffer() {
    if (!queueEntry) return;
    try {
      await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: queueEntry.id, action: 'decline' }),
      });
    } catch {}
    reset();
  }

  async function handleCancelQueue() {
    if (!queueEntry) return;
    try {
      await supabase
        .from('queue_entries')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', queueEntry.id);
    } catch {}
    reset();
  }

  async function handleCancelExisting() {
    if (!queueEntry) return;
    try {
      await supabase
        .from('queue_entries')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', queueEntry.id);
    } catch {}
    setQueueEntry(null);
    setStep('select-court');
  }

  function reset() {
    setMember(null);
    setSelectedCourt(null);
    setGameType(null);
    setDuration(null);
    setMatchTitle('');
    setQueueEntry(null);
    setErrorInfo(null);
    setStep('idle');
    focusRfid();
  }

  function handleBack() {
    switch (step) {
      case 'select-game': setStep('select-court'); break;
      case 'select-duration': setStep('select-game'); break;
      case 'confirm': setStep('select-duration'); break;
      default: reset();
    }
  }

  const creditsRequired = config && member && duration && gameType
    ? getCost(config, duration, gameType === '2v2' ? 4 : 2)
    : 0;

  const fullScreenSteps = new Set<KioskStep>(['offer', 'success', 'error']);
  const hasSidebar = !fullScreenSteps.has(step);

  const courtOverview = useMemo(() => <CourtOverview />, []);

  function withLayout(content: ReactNode) {
    return (
      <TerminalLayout sidebar={hasSidebar ? courtOverview : undefined}>
        {content}
      </TerminalLayout>
    );
  }

  if (step === 'error' && errorInfo) {
    return withLayout(<ErrorScreen title={errorInfo.title} message={errorInfo.message} onRetry={reset} />);
  }

  switch (step) {
    case 'idle':
      return (
        <div className="relative min-h-screen bg-black">
          <form onSubmit={handleRfidSubmit}
            className="absolute top-3 right-3 z-10 bg-zinc-900/90 border border-zinc-800 rounded-lg px-4 py-2.5 flex items-center gap-2"
          >
            <input ref={rfidRef} type="text" autoFocus
              className="w-32 text-center text-sm bg-transparent text-zinc-100 placeholder-zinc-500 border-0 outline-none"
              placeholder={testMode ? "test" : "RFID"}
            />
            <button type="submit"
              className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 cursor-pointer shrink-0"
            >
              Go
            </button>
          </form>
          <QueueBoard />
        </div>
      );

    case 'existing-queue':
      return withLayout(
        member && queueEntry && (
          <div className="min-h-full flex flex-col items-center justify-center p-8 text-center">
            <h2 className="text-2xl font-bold text-amber-400 mb-4">Existing Booking</h2>
            <p className="text-zinc-300 mb-6">You have an active queue entry:</p>
            <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 mb-8 w-full max-w-sm text-left space-y-3">
              <p className="text-zinc-400 text-sm">Queue Position</p>
              <p className="text-zinc-100 text-lg font-semibold">Waiting</p>
              {queueEntry.courts?.name && (
                <>
                  <p className="text-zinc-400 text-sm">Court</p>
                  <p className="text-zinc-100">{queueEntry.courts.name}</p>
                </>
              )}
            </div>
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <button onClick={handleCancelExisting}
                className="w-full py-3 px-6 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold text-lg cursor-pointer disabled:opacity-50"
              >
                Cancel Booking
              </button>
              <button onClick={() => setStep('select-court')}
                className="w-full py-3 px-6 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-lg cursor-pointer"
              >
                Book Another
              </button>
            </div>
          </div>
        )
      );

    case 'select-court':
      return withLayout(
        <SelectCourt courts={courts} onSelect={handleSelectCourt} onBack={reset} />
      );

    case 'select-game':
      return withLayout(
        <SelectGameType onSelect={handleSelectGame} onBack={handleBack} />
      );

    case 'select-duration':
      return withLayout(
        config && <SelectDuration durations={config.durations} rates={config.rates} onSelect={handleSelectDuration} onBack={handleBack} />
      );

    case 'confirm':
      return withLayout(
        member && selectedCourt && gameType && duration && (
          <ConfirmBooking
            courtName={selectedCourt.name}
            gameType={gameType}
            duration={duration}
            creditsRequired={creditsRequired}
            balance={member.balance}
            matchTitle={matchTitle}
            onMatchTitleChange={setMatchTitle}
            onConfirm={handleJoinQueue}
            onBack={handleBack}
            busy={busy}
          />
        )
      );

    case 'offer':
      return withLayout(
        queueEntry && (
          <ReservationOffer
            courtName={selectedCourt?.name ?? queueEntry.court_name ?? 'Court'}
            expiresAt={queueEntry.expires_at}
            onAccept={handleAcceptOffer}
            onDecline={handleDeclineOffer}
            busy={busy}
          />
        )
      );

    case 'success':
      return withLayout(
        member && duration && gameType && (
          <BookingSuccess
            courtName={selectedCourt?.name}
            duration={duration}
            creditsUsed={creditsRequired}
            creditsRemaining={member.balance}
          />
        )
      );

    default:
      return withLayout(
        <IdleScreen rfidRef={rfidRef} onRfidSubmit={handleRfidSubmit} />
      );
  }
}
