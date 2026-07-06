'use client';

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { TerminalLayout } from './TerminalLayout';
import { CourtOverview } from './CourtOverview';
import { IdleScreen } from './IdleScreen';
import { RfidWelcome } from './RfidWelcome';
import { SelectCourt } from './SelectCourt';
import { SelectGameType } from './SelectGameType';
import { SelectDuration } from './SelectDuration';
import { ConfirmBooking } from './ConfirmBooking';
import { QueueStatus } from './QueueStatus';
import { ReservationOffer } from './ReservationOffer';
import { BookingSuccess } from './BookingSuccess';
import { ErrorScreen } from './ErrorScreen';

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
  | 'welcome'
  | 'select-court'
  | 'select-game'
  | 'select-duration'
  | 'confirm'
  | 'queued'
  | 'offer'
  | 'success'
  | 'queue-status'
  | 'error';

const RATES: Record<string, number> = { '30': 150, '60': 300, '90': 450 };
const SUCCESS_DELAY_MS = 5000;

const TEST_PLAYERS: Player[] = [
  { id: '65d5489e-521c-4fe1-8da2-3cfce7adc289', memberId: '001', firstName: 'test', lastName: 'user', balance: 100 },
];

export function TerminalKiosk() {
  const [step, setStep] = useState<KioskStep>('idle');
  const [member, setMember] = useState<Player | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<CourtOption | null>(null);
  const [gameType, setGameType] = useState<'1v1' | '2v2' | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [queueEntry, setQueueEntry] = useState<any>(null);
  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string } | null>(null);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [testMode, setTestMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const rfidRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const isTest = new URLSearchParams(window.location.search).get('testmode') === 'true';
    setTestMode(isTest);
    if (isTest) {
      handleTestPlayer(TEST_PLAYERS[0]);
    }
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
  }, [step]);

  useEffect(() => {
    if (!queueEntry || step !== 'queued') return;
    const channel = supabase.channel(`kiosk-${queueEntry.id}`);
    channel.on('postgres_changes',
      { event: '*', schema: 'public', table: 'queue_entries', filter: `id=eq.${queueEntry.id}` },
      async (payload) => {
        const updated = payload.new as any;
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
    fetchCourts();
  }, []);

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
    await lookupMember(uid);
  }

  async function lookupMember(uid: string) {
    setErrorInfo(null);
    try {
      const { data, error: err } = await supabase
        .from('rfid_cards')
        .select('uid, member_id, members!inner(id, member_id, first_name, last_name, wallets(balance))')
        .eq('uid', uid)
        .eq('status', 'Active')
        .single();
      if (err || !data) { setErrorInfo({ title: 'RFID Read Failed', message: 'Card not recognized. Please try again.' }); setStep('error'); return; }
      const m = data.members as any;
      const player: Player = {
        id: m.id,
        memberId: m.member_id,
        firstName: m.first_name,
        lastName: m.last_name,
        balance: Array.isArray(m.wallets) ? (m.wallets[0]?.balance ?? 0) : (m.wallets?.balance ?? 0),
      };
      setMember(player);
      await checkExistingQueue(player.id);
    } catch { setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' }); setStep('error'); }
  }

  async function checkExistingQueue(memberId: string) {
    const { data } = await supabase
      .from('queue_entries')
      .select('*, courts!left(name)')
      .eq('member_id', memberId)
      .in('status', ['waiting', 'offered'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    if (data) {
      setQueueEntry(data);
      if (data.status === 'offered') { setStep('offer'); return; }
      setStep('queue-status');
      return;
    }
    const { data: activeBooking } = await supabase
      .from('games')
      .select('id, court_id, courts!inner(name), duration, status, start_time')
      .in('status', ['In Progress', 'Scheduled']);
    if (activeBooking && activeBooking.length > 0) {
      const { data: myGames } = await supabase
        .from('game_players')
        .select('game_id')
        .eq('member_id', memberId)
        .in('game_id', activeBooking.map(g => g.id));
      if (myGames && myGames.length > 0) {
        setErrorInfo({ title: 'Active Booking', message: 'You already have an active booking.' });
        setStep('error');
        return;
      }
    }
    setStep('welcome');
  }

  function handleTestPlayer(p: Player) {
    setMember(p);
    checkExistingQueue(p.id);
  }

  function handleContinueToCourt() {
    setStep('select-court');
  }

  function handleSelectCourt(court: CourtOption) {
    if (court.status !== 'Available') return;
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
    const partySize = gameType === '2v2' ? 4 : 2;
    const cost = (RATES[String(duration)] * (duration / 30)) / (partySize === 4 ? 2 : 1);
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
          courtId: selectedCourt?.id,
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
        setStep('queued');
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
      const cost = duration ? (RATES[String(duration)] * (duration / 30)) / ((gameType === '2v2' ? 4 : 2) === 4 ? 2 : 1) : 0;
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

  function reset() {
    setMember(null);
    setSelectedCourt(null);
    setGameType(null);
    setDuration(null);
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

  const creditsRequired = member && duration && gameType
    ? (RATES[String(duration)] * (duration / 30)) / ((gameType === '2v2' ? 4 : 2) === 4 ? 2 : 1)
    : 0;

  const fullScreenSteps = new Set<KioskStep>(['offer', 'success', 'error']);
  const hasSidebar = !fullScreenSteps.has(step);

  function withLayout(content: ReactNode) {
    return (
      <TerminalLayout sidebar={hasSidebar ? <CourtOverview /> : undefined}>
        {content}
      </TerminalLayout>
    );
  }

  if (step === 'error' && errorInfo) {
    return withLayout(<ErrorScreen title={errorInfo.title} message={errorInfo.message} onRetry={reset} />);
  }

  switch (step) {
    case 'idle':
      return withLayout(
        <IdleScreen
          rfidRef={rfidRef}
          onRfidSubmit={handleRfidSubmit}
        />
      );

    case 'welcome':
      return withLayout(
        member && <RfidWelcome member={member} onContinue={handleContinueToCourt} />
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
        <SelectDuration onSelect={handleSelectDuration} onBack={handleBack} />
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
            onConfirm={handleJoinQueue}
            onBack={handleBack}
            busy={busy}
          />
        )
      );

    case 'queued':
      return withLayout(
        queueEntry && member && selectedCourt && (
          <QueueStatus
            courtName={selectedCourt.name}
            position={queueEntry.position ?? 1}
            estimatedWait={queueEntry.estimatedWait ?? '~60 min'}
            duration={queueEntry.duration ?? duration ?? 0}
            status="waiting"
            onCancel={handleCancelQueue}
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
        member && selectedCourt && gameType && duration && (
          <BookingSuccess
            courtName={selectedCourt.name}
            duration={duration}
            creditsUsed={creditsRequired}
            creditsRemaining={member.balance}
          />
        )
      );

    case 'queue-status':
      return withLayout(
        queueEntry && member && (
          <QueueStatus
            courtName={selectedCourt?.name ?? 'Court'}
            position={queueEntry.position ?? 1}
            estimatedWait={queueEntry.estimatedWait ?? '~60 min'}
            duration={queueEntry.duration ?? duration ?? 0}
            status={queueEntry.status}
            onCancel={handleCancelQueue}
          />
        )
      );

    default:
      return withLayout(
        <IdleScreen rfidRef={rfidRef} onRfidSubmit={handleRfidSubmit} />
      );
  }
}
