'use client';

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BookingLayout } from './BookingLayout';
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
import { GuestBookingForm } from './GuestBookingForm';
import { GuestBookingSuccess } from './GuestBookingSuccess';
import type { ProductsConfig } from '@/lib/products-config-types';
import { getCost } from '@/lib/products-config-types';
import { fetchBoardSnapshot } from '@/app/booking/queue/actions';
import { AlertCircle, Trash2, Plus, CalendarCheck, Calendar, Clock, StopCircle } from 'lucide-react';

interface ActiveGameInfo {
  id: string;
  courtId: string;
  courtName: string;
  startTime: string;
  duration: number;
}

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
  | 'booting'
  | 'idle'
  | 'rfid-decision'
  | 'existing-queue'

  | 'select-schedule-datetime'
  | 'select-court'
  | 'select-game'
  | 'select-duration'
  | 'confirm'
  | 'guest-booking'
  | 'guest-success'
  | 'offer'
  | 'success'
  | 'schedule-success'
  | 'error';


const SUCCESS_DELAY_MS = 5000;

export function BookingKiosk() {
  const [step, setStep] = useState<KioskStep>('idle');
  const [member, setMember] = useState<Player | null>(null);
  const [decision, setDecision] = useState<any>(null);
  const [terminalToken, setTerminalToken] = useState<string | null>(null);
  const [activeGame, setActiveGame] = useState<ActiveGameInfo | null>(null);
  const [selectedCourt, setSelectedCourt] = useState<CourtOption | null>(null);
  const [gameType, setGameType] = useState<'1v1' | '2v2' | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [matchTitle, setMatchTitle] = useState('');
  const [guestRequest, setGuestRequest] = useState<{ referenceCode: string; holdExpiresAt: string } | null>(null);
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [scheduledBooking, setScheduledBooking] = useState<{ id: string; courtName: string; start: string; duration: number } | null>(null);
  
  const [_queueEntry, _setQueueEntry] = useState<any>(null);
  const queueEntryIdRef = useRef<string | null>(null);
  const setQueueEntry = useCallback((entry: any | ((prev: any) => any)) => {
    _setQueueEntry((prev: any) => {
      const next = typeof entry === 'function' ? entry(prev) : entry;
      queueEntryIdRef.current = next?.id || null;
      return next;
    });
  }, []);
  const queueEntry = _queueEntry;

  const [errorInfo, setErrorInfo] = useState<{ title: string; message: string } | null>(null);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [testMode, setTestMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [scannedNfcUid, setScannedNfcUid] = useState<string | null>(null);
  const [nfcStatus, setNfcStatus] = useState<'idle' | 'waiting_for_interaction' | 'active' | 'error' | 'unsupported'>('idle');
  const [nfcBadgeVisible, setNfcBadgeVisible] = useState(false);
  const nfcBadgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [config, setConfig] = useState<ProductsConfig | null>(null);
  const rfidRef = useRef<HTMLInputElement>(null);
  const nfcScannerRef = useRef<any>(null);
  const supabase = useMemo(() => createClient(), []);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stepRef = useRef<KioskStep>('idle');

  useEffect(() => {
    const isTest = new URLSearchParams(window.location.search).get('testmode') === 'true';
    setTestMode(isTest);
  }, []);

  useEffect(() => {
    if (step === 'idle') {
      setTimeout(() => rfidRef.current?.focus(), 200);
    }
  }, [step]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("NDEFReader" in window)) {
      setNfcStatus('unsupported');
      return;
    }

    setNfcStatus('waiting_for_interaction');

    const startScanner = async () => {
      if (nfcScannerRef.current) return;

      try {
        const ndef = new (window as any).NDEFReader();
        await ndef.scan();
        nfcScannerRef.current = ndef;
        setNfcStatus('active');
        setNfcBadgeVisible(true);
        // Auto-hide the "active" badge after 3 seconds
        if (nfcBadgeTimer.current) clearTimeout(nfcBadgeTimer.current);
        nfcBadgeTimer.current = setTimeout(() => setNfcBadgeVisible(false), 3000);
        
        ndef.addEventListener("reading", ({ serialNumber }: any) => {
          if (serialNumber) {
             const uid = serialNumber.replace(/:/g, "").toUpperCase();
             setScannedNfcUid(uid);
          }
        });
      } catch (err) {
        console.error("NFC start failed", err);
        setNfcStatus('error');
      }
    };

    document.addEventListener("click", startScanner);
    document.addEventListener("touchstart", startScanner);

    return () => {
      document.removeEventListener("click", startScanner);
      document.removeEventListener("touchstart", startScanner);
    };
  }, []);

  useEffect(() => {
    if (scannedNfcUid && step === 'idle') {
      lookupMember(scannedNfcUid);
      setScannedNfcUid(null);
    }
  }, [scannedNfcUid, step]);

  useEffect(() => {
    stepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (step === 'success' || step === 'guest-success' || step === 'schedule-success') {
      successTimer.current = setTimeout(() => reset(), SUCCESS_DELAY_MS);
      return () => { if (successTimer.current) clearTimeout(successTimer.current); };
    }
    if (step === 'select-court') {
      fetchCourts();
    }
  }, [step]);

  const checkQueueEntryStatus = useCallback(async (id: string) => {
    try {
      const { data } = await supabase
        .from('queue_entries')
        .select('status, expires_at, court_id, duration, party_size')
        .eq('id', id)
        .single();
      if (!data) return;
      // Only clear the success timer when a poll arrives outside the success
      // screen — otherwise the success screen never auto-resets (Critical #4)
      if (successTimer.current && stepRef.current !== 'success') clearTimeout(successTimer.current);
      if (data.status === 'offered') {
        setQueueEntry((prev: any) => prev ? { ...prev, status: 'offered', expires_at: data.expires_at, court_id: data.court_id } : prev);
        setStep('offer');
      } else if (data.status === 'completed') {
        setQueueEntry((prev: any) => prev ? { ...prev, status: 'completed' } : prev);
        if (!duration && (data as any).duration) setDuration((data as any).duration);
        if (!gameType && (data as any).party_size) setGameType((data as any).party_size === 4 ? '2v2' : '1v1');
        setStep('success');
      } else if (['expired', 'declined', 'cancelled'].includes(data.status)) {
        setQueueEntry((prev: any) => prev ? { ...prev, status: data.status } : prev);
        setStep('idle');
      }
    } catch {}
  }, [supabase]);


  const fetchCourts = useCallback(async () => {
    try {
      const snap = await fetchBoardSnapshot();
      const nowSec = Date.now() / 1000;
      setCourts(snap.courts.map((c: any) => {
        const isPlayingNow = c.startTime > 0 && c.startTime <= nowSec;
        return {
          id: c.id,
          name: c.name,
          status: isPlayingNow ? 'Playing' : 'Available',
        };
      }));
    } catch {}
  }, []);

  useEffect(() => {
    fetchInitial();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await fetchCourts();
    };
    run();
    
    const es = new EventSource('/api/queue/events');
    let sseDebounce: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = () => { 
      if (!cancelled) {
        if (sseDebounce) clearTimeout(sseDebounce);
        sseDebounce = setTimeout(() => {
          sseDebounce = null;
          if (!cancelled) {
            fetchCourts(); 
            if (queueEntryIdRef.current) checkQueueEntryStatus(queueEntryIdRef.current);
          }
        }, 100);
      }
    };
    es.onerror = () => {
      // EventSource handles reconnection automatically
    };

    const poller = setInterval(() => { if (!cancelled) fetchCourts(); }, 30_000);
    return () => { cancelled = true; if (sseDebounce) clearTimeout(sseDebounce); clearInterval(poller); es.close(); };
  }, [fetchCourts, checkQueueEntryStatus]);

  async function fetchInitial() {
    try {
      // 1. Test backend API connection
      const apiRes = await fetch('/api/health');
      if (!apiRes.ok) throw new Error('API unreachable');

      // 2. Test Supabase Database connection
      const { data: rows, error } = await supabase.from('settings').select('key, value').in('key', ['products', 'prices', 'preparationTime']);
      if (error) throw new Error('Database unreachable');

      if (rows) {
        const map = new Map(rows.map(r => [r.key, r.value]));
        const products = tryParse(map.get('products'));
        const rates = tryParse(map.get('prices'));
        const prepTimeSec = parseInt(map.get('preparationTime') ?? '', 10);
        setConfig({
          matchTypes: products?.matchTypes ?? ['1v1', '2v2'],
          durations: products?.durations ?? [30, 60, 90],
          rates: rates ?? { '30': 150, '60': 300, '90': 450 },
          
        });
      }
      await fetchCourts();
      setStep(prev => (prev === 'booting' || prev === 'idle' ? 'idle' : prev));
    } catch (err: any) {
      setErrorInfo({ title: 'System Offline', message: 'Unable to connect to the server. Retrying...' });
      setStep('error');
      setTimeout(fetchInitial, 5000); // retry after 5 seconds
    }
  }

  function tryParse(json: string | undefined): any {
    if (!json) return undefined;
    try { return JSON.parse(json); } catch { return undefined; }
  }



  function focusRfid() {
    setTimeout(() => rfidRef.current?.focus(), 200);
  }

  function localDateTimeToIso(date: string, time: string): string {
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = time.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0).toISOString();
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
      const memberRes = await fetch(`/api/terminal/member/${encodeURIComponent(uid)}`);
      const memberData = await memberRes.json();
      if (!memberRes.ok) { setErrorInfo({ title: 'RFID Read Failed', message: memberData.error ?? 'Card not recognized. Please try again.' }); setStep('error'); return; }
      setTerminalToken(memberData.token);
      const player: Player = {
        id: memberData.id,
        memberId: memberData.memberId,
        firstName: memberData.firstName,
        lastName: memberData.lastName,
        balance: memberData.balance ?? 0,
      };
      setMember(player);
      setDecision(memberData.decision);
      
      const loadedActiveGame = memberData.activeGame ?? (
        memberData.decision?.type === 'already active' ? {
          id: memberData.decision.gameId,
          courtId: memberData.decision.courtId,
          courtName: memberData.decision.courtName || 'Current Court',
          startTime: new Date().toISOString(),
          duration: 60,
        } : null
      );
      setActiveGame(loadedActiveGame);

      let loadedQueue = memberData.activeQueue ?? null;
      if (!loadedQueue && memberData.decision?.type === 'already queued') {
        try {
          const queueRes = await fetch(`/api/queue?memberId=${encodeURIComponent(player.id)}`, {
            headers: { 'x-terminal-token': memberData.token },
          });
          if (queueRes.ok) {
            const entries = await queueRes.json();
            const data = Array.isArray(entries) ? entries[0] : null;
            if (data) loadedQueue = data;
          }
        } catch {
          // ignore
        }
      }
      setQueueEntry(loadedQueue);

      if (loadedQueue && loadedQueue.status === 'offered') {
        setStep('offer');
        return;
      }

      if (loadedActiveGame || (loadedQueue && loadedQueue.status === 'waiting') || memberData.decision?.type === 'already queued') {
        setStep('existing-queue');
        return;
      }

      setStep('rfid-decision');
    } catch { 
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' }); 
      setStep('error'); 
    }
  }

  function handleSelectCourt(court: CourtOption) {
    setSelectedCourt(court);
    setStep('select-game');
  }

  function handleSelectGame(gt: '1v1' | '2v2') {
    setGameType(gt);
    if (!scheduleMode && decision?.capped) {
      setStep('confirm');
    } else {
      setStep('select-duration');
    }
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
      const endpoint = scheduleMode ? '/api/bookings' : '/api/queue';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(terminalToken ? { 'x-terminal-token': terminalToken } : {}),
        },
        body: JSON.stringify({
          memberId: member.id,
          start: scheduleMode && scheduleDate && scheduleTime ? localDateTimeToIso(scheduleDate, scheduleTime) : new Date().toISOString(),
          duration,
          partySize,
          playerIds: [member.id],
          ...(selectedCourt?.id ? { courtId: selectedCourt.id === 'any' && scheduleMode ? undefined : selectedCourt.id } : {}),
          matchTitle: matchTitle || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json();
        const details = body.details?.fieldErrors ? Object.entries(body.details.fieldErrors).flatMap(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`).join(' · ') : '';
        setErrorInfo({ title: 'Unable to Join Queue', message: details || body.error || 'Please try again.' });
        setStep('error');
        setBusy(false);
        return;
      }
      const entry = await res.json();
      const remaining = member.balance - cost;
      setMember(prev => prev ? { ...prev, balance: remaining } : prev);
      
      if (scheduleMode && entry.id) {
        setScheduledBooking({
          id: entry.id,
          courtName: selectedCourt?.name ?? 'Court',
          start: scheduleDate && scheduleTime ? localDateTimeToIso(scheduleDate, scheduleTime) : new Date().toISOString(),
          duration: duration ?? 0,
        });
        setStep('schedule-success');
      } else if (entry.status === 'completed' || entry.status === 'scheduled') {
        setQueueEntry(entry);
        setStep('success');
      } else {
        setQueueEntry(entry);
        setStep('existing-queue');
      }
    } catch {
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' });
      setStep('error');
    }
    setBusy(false);
  }

  async function handleGuestBooking(data: any) {
    setBusy(true);
    setErrorInfo(null);
    try {
      const res = await fetch('/api/guest-booking-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) {
        setErrorInfo({ title: 'Unable to Hold Slot', message: body.error ?? 'Please choose another time.' });
        setStep('error');
        return;
      }
      setGuestRequest(body);
      setStep('guest-success');
    } catch {
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' });
      setStep('error');
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptOffer() {
    if (!queueEntry) return;
    setBusy(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(terminalToken ? { 'x-terminal-token': terminalToken } : {}),
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
    setBusy(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(terminalToken ? { 'x-terminal-token': terminalToken } : {}),
        },
        body: JSON.stringify({ id: queueEntry.id, action: 'decline' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorInfo({ title: 'Decline Failed', message: body.error || 'Please try again.' });
        setStep('error');
        return;
      }
      reset();
    } catch {
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' });
      setStep('error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelQueue() {
    if (!queueEntry) return;
    try {
      const res = await fetch(`/api/queue/${queueEntry.id}`, {
        method: 'DELETE',
        headers: terminalToken ? { 'x-terminal-token': terminalToken } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorInfo({ title: 'Cancel Failed', message: body.error ?? 'Please try again.' });
        setStep('error');
        return;
      }
    } catch { setErrorInfo({ title: 'Cancel Failed', message: 'Check connection and try again.' }); setStep('error'); return; }
    reset();
  }

  async function handleEndOngoingGame() {
    const gameId = activeGame?.id || decision?.gameId;
    setBusy(true);
    try {
      const res = await fetch('/api/terminal/game/end', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(terminalToken ? { 'x-terminal-token': terminalToken } : {}),
        },
        body: JSON.stringify({ gameId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorInfo({ title: 'Unable to End Game', message: body.error || 'Please try again.' });
        setStep('error');
        return;
      }
      setActiveGame(null);
      if (!queueEntry) {
        reset();
      }
    } catch {
      setErrorInfo({ title: 'Unable to Connect', message: 'Check connection and try again.' });
      setStep('error');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancelExisting() {
    if (!queueEntry) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/queue/${queueEntry.id}`, {
        method: 'DELETE',
        headers: terminalToken ? { 'x-terminal-token': terminalToken } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrorInfo({ title: 'Cancel Failed', message: body.error ?? 'Please try again.' });
        setStep('error');
        return;
      }
      setQueueEntry(null);
      if (!activeGame) {
        reset();
      }
    } catch { 
      setErrorInfo({ title: 'Cancel Failed', message: 'Check connection and try again.' }); 
      setStep('error'); 
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMember(null);
    setTerminalToken(null);
    setSelectedCourt(null);
    setGameType(null);
    setDuration(null);
    setMatchTitle('');
    setGuestRequest(null);
    setScheduleMode(false);
    setScheduleDate('');
    setScheduleTime('');
    setQueueEntry(null);
    setActiveGame(null);
    setErrorInfo(null);
    setStep('idle');
    focusRfid();
  }

  function handleBack() {
    switch (step) {
      case 'select-court': setStep(scheduleMode ? 'select-schedule-datetime' : (activeGame || queueEntry ? 'existing-queue' : 'rfid-decision')); break;
      case 'select-game': setStep('select-court'); break;
      case 'select-duration': setStep('select-game'); break;
      case 'confirm': setStep('select-duration'); break;
      case 'select-schedule-datetime': setStep(activeGame || queueEntry ? 'existing-queue' : 'rfid-decision'); break;
      case 'rfid-decision': reset(); break;
      case 'existing-queue': reset(); break;
      default: reset();
    }
  }

  const creditsRequired = config && member && duration && gameType
    ? getCost(config, duration, gameType === '2v2' ? 4 : 2)
    : 0;

  const fullScreenSteps = new Set<KioskStep>(['offer', 'success', 'schedule-success', 'guest-success', 'error']);
  const hasSidebar = !fullScreenSteps.has(step);

  const courtOverview = useMemo(() => <CourtOverview />, []);

  function withLayout(content: ReactNode) {
    return (
      <BookingLayout sidebar={hasSidebar ? courtOverview : undefined}>
        {content}
      </BookingLayout>
    );
  }

  if (step === 'error' && errorInfo) {
    return withLayout(<ErrorScreen title={errorInfo.title} message={errorInfo.message} onRetry={reset} />);
  }

  const renderStep = () => {
    switch (step) {
      case 'idle':
      return (
        <div className="relative min-h-screen bg-[var(--booking-bg)]">
          <QueueBoard onBookAsGuest={() => { setErrorInfo(null); setStep('guest-booking'); }} />
          {testMode && (
            <div className="absolute top-4 right-4 z-50 bg-[#1b2a23]/95 border border-[#2b4035] rounded-xl p-4 w-64 shadow-2xl animate-fade-in">
              <h3 className="text-xs font-bold text-zinc-300 mb-2 flex items-center gap-1.5">
                <span>🔧</span>
                <span>Test RFID Input</span>
              </h3>
              <form onSubmit={handleRfidSubmit} className="flex gap-2">
                <input
                  ref={rfidRef}
                  type="text"
                  placeholder="Enter Card UID"
                  className="flex-1 bg-[#15231d] border border-[#40584a] rounded-lg px-2.5 py-1.5 text-xs text-[#FCFCF6] placeholder-[#718178] focus:outline-none focus:border-[#0E5E9A]"
                />
                <button
                  type="submit"
                  className="bg-secondary hover:bg-secondary/90 text-white text-xs font-extrabold px-3 py-1.5 rounded-lg active:scale-95 transition-all cursor-pointer"
                >
                  Go
                </button>
              </form>
            </div>
          )}
        </div>
      );

    case 'existing-queue':
      return withLayout(
        member && (queueEntry || activeGame) && (
          <div className="min-h-full flex flex-col items-center justify-center p-6 text-center animate-fade-in max-w-lg mx-auto">
            <div className="size-12 rounded-full bg-[#32A45E]/15 border border-[#32A45E]/45 flex items-center justify-center mb-3 text-emerald-600 dark:text-[#72d493]">
              <AlertCircle className="size-6" />
            </div>
            <h2 className="text-xl font-black text-[var(--booking-text)] tracking-wide">Active Session Found</h2>
            <p className="text-xs text-[var(--booking-muted)] mt-1 mb-6">
              Welcome back, <span className="text-[var(--booking-text)] font-bold">{member.firstName}</span>. Manage your active game, queue, or add another booking.
            </p>

            <div className="w-full space-y-3 mb-6">
              {/* Ongoing Game Card */}
              {activeGame && (
                <div className="bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-4 text-left shadow-xs space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-[#72d493] uppercase tracking-widest flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-[#32A45E] animate-pulse" />
                      Ongoing Match
                    </span>
                    <span className="text-xs font-bold text-emerald-700 dark:text-[#72d493] bg-[#32A45E]/10 px-2 py-0.5 rounded border border-[#32A45E]/25">
                      In Progress
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-base font-black text-[var(--booking-text)]">{activeGame.courtName || 'Court'}</div>
                      <div className="text-[11px] text-[var(--booking-muted)] mt-0.5">{activeGame.duration} min match</div>
                    </div>
                    <button
                      onClick={handleEndOngoingGame}
                      disabled={busy}
                      className="py-2 px-3 rounded-xl bg-red-500/10 text-red-600 dark:text-[#ff9b9b] border border-red-500/30 hover:bg-red-500/20 text-xs font-extrabold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <StopCircle className="size-3.5" />
                      <span>End Game Early</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Waiting Queue Card */}
              {queueEntry && (
                <div className="bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-4 text-left shadow-xs space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-amber-600 dark:text-[#e2b85a] uppercase tracking-widest flex items-center gap-1.5">
                      <Clock className="size-3.5" />
                      Waiting List
                    </span>
                    <span className="text-xs font-bold text-amber-700 dark:text-[#e2b85a] bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/25">
                      Position #{queueEntry.position ?? 1}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-base font-black text-[var(--booking-text)]">
                        {queueEntry.courtName || queueEntry.court_name || queueEntry.courts?.name || 'Any Court'}
                      </div>
                      <div className="text-[11px] text-[var(--booking-muted)] mt-0.5">Waiting for court to open</div>
                    </div>
                    <button
                      onClick={handleCancelExisting}
                      disabled={busy}
                      className="py-2 px-3 rounded-xl bg-red-500/10 text-red-600 dark:text-[#ff9b9b] border border-red-500/30 hover:bg-red-500/20 text-xs font-extrabold active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="size-3.5" />
                      <span>Cancel Queue</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Add Another Booking Options - only allowed if member does not already hold a queue ticket */}
            {!queueEntry ? (
              <div className="w-full bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-4 mb-4 text-left shadow-xs">
                <div className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-widest mb-1">
                  Book Another Game
                </div>
                <p className="text-[11px] text-[var(--booking-subtle)] mb-3">
                  {activeGame ? 'Max 1 hour while currently in game to give other players a turn.' : 'Choose how you would like to book.'}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => { setScheduleMode(false); setStep('select-court'); }}
                    disabled={busy}
                    className="py-3.5 px-4 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-secondary/10 flex items-center justify-center gap-2"
                  >
                    <Plus className="size-4 stroke-[2.5]" />
                    <span>Play Now / Queue Up</span>
                  </button>
                  <button
                    onClick={() => { setScheduleMode(true); setStep('select-schedule-datetime'); }}
                    disabled={busy}
                    className="py-3.5 px-4 rounded-xl bg-[#0E5E9A] hover:bg-[#1876b5] text-white font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-black/10 flex items-center justify-center gap-2"
                  >
                    <Calendar className="size-4" />
                    <span>Schedule for Later</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-4 mb-4 text-left shadow-xs">
                <div className="text-[10px] font-bold text-amber-600 dark:text-[#e2b85a] uppercase tracking-widest mb-1 flex items-center gap-1.5">
                  <span>ℹ️</span>
                  <span>Queue Limit Reached</span>
                </div>
                <p className="text-xs text-[var(--booking-muted)] leading-relaxed">
                  You already have an active spot in the waiting list. To give everyone a chance to play, you can only hold one queue spot at a time. You can book again once your waiting game begins, or by cancelling your queue ticket above.
                </p>
              </div>
            )}

            <button
              onClick={reset}
              className="py-2.5 px-5 rounded-xl text-[var(--booking-muted)] hover:text-[var(--booking-text)] hover:bg-[var(--booking-panel)] text-xs font-bold transition-all cursor-pointer"
            >
              Done / Back to Home
            </button>
          </div>
        )
      );

    case 'rfid-decision':
      return withLayout(
        <div className="min-h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <h2 className="text-lg font-black text-[var(--booking-text)] tracking-wide mb-2">Welcome, {member?.firstName}</h2>
          
          {decision?.type === 'check-in scheduled' ? (
            <>
              <p className="text-xs text-[var(--booking-muted)] mb-8">You have a scheduled booking starting soon.</p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => {
                    // Quick check-in bypasses format/duration
                    setSelectedCourt({ id: decision.courtId, name: decision.courtName || 'Assigned Court', status: 'Reserved' });
                    setDuration(decision.duration);
                    setGameType('1v1'); // Default for pricing bypass if any
                    setScheduleMode(false);
                    setStep('confirm');
                  }}
                  className="w-full py-4 px-6 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  Check In Now
                </button>
              </div>
            </>
          ) : decision?.type === 'no eligible window' ? (
            <>
              <p className="text-xs text-red-500 dark:text-red-400 mb-8">{decision.reason}</p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => { setScheduleMode(true); setStep('select-schedule-datetime'); }}
                  className="w-full py-4 px-6 rounded-xl bg-[#0E5E9A] hover:bg-[#1876b5] text-white font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-black/20"
                >
                  Schedule for Later
                </button>
                <button
                  onClick={reset}
                  className="w-full py-4 px-6 rounded-xl border border-[var(--booking-border)] hover:bg-[var(--booking-panel)] text-[var(--booking-text)] font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : decision?.type === 'already active' ? (
            <>
              <p className="text-xs text-amber-600 dark:text-amber-400 mb-8">
                You are currently playing{activeGame?.courtName ? ` on ${activeGame.courtName}` : ''}, but you can still book another match.
              </p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                <button
                  onClick={() => { setScheduleMode(false); setStep('select-court'); }}
                  className="w-full py-4 px-6 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                >
                  Play Now / Queue Up
                </button>
                <button
                  onClick={() => { setScheduleMode(true); setStep('select-schedule-datetime'); }}
                  className="w-full py-4 px-6 rounded-xl bg-[#0E5E9A] hover:bg-[#1876b5] text-white font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-black/20"
                >
                  Schedule for Later
                </button>
                <button
                  onClick={handleEndOngoingGame}
                  className="w-full py-3.5 px-6 rounded-xl bg-red-500/10 text-red-600 dark:text-[#ff9b9b] border border-red-500/30 hover:bg-red-500/20 font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <StopCircle className="size-4" />
                  <span>End Ongoing Game</span>
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-[var(--booking-muted)] mb-8">How would you like to book?</p>
              <div className="flex flex-col gap-3 w-full max-w-xs">
                {decision?.type === 'play now' && (
                  <button
                    onClick={() => {
                      setScheduleMode(false);
                      if (decision.capped) {
                        setSelectedCourt({ id: decision.courtId, name: decision.courtName || 'Auto Selected', status: 'Available' });
                        setDuration(decision.duration);
                        setStep('select-game'); // skip duration select
                      } else {
                        setStep('select-court');
                      }
                    }}
                    className="w-full py-4 px-6 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-sm uppercase tracking-wider flex flex-col items-center active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-emerald-500/10"
                  >
                    <span>Play Now</span>
                    {decision.capped && decision.cutoffTime && (
                      <span className="text-[9px] text-zinc-200 mt-1 lowercase font-normal opacity-90">
                        until {new Date(decision.cutoffTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </button>
                )}
                <button
                  onClick={() => { setScheduleMode(true); setStep('select-schedule-datetime'); }}
                  className="w-full py-4 px-6 rounded-xl bg-[#0E5E9A] hover:bg-[#1876b5] text-white font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-black/20"
                >
                  Schedule
                </button>
              </div>
            </>
          )}
        </div>
      );

    case 'select-schedule-datetime':
      return withLayout(
        <div className="min-h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
          <h2 className="text-lg font-black text-[var(--booking-text)] tracking-wide mb-6">Select Date & Time</h2>
          <div className="flex flex-col gap-4 w-full max-w-xs">
            <div>
              <label htmlFor="schedule-date" className="block text-xs font-bold text-[var(--booking-muted)] mb-2 text-left">Date</label>
              <input
                id="schedule-date"
                type="date"
                min={new Date().toISOString().split('T')[0]}
                max={new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                className="w-full bg-[var(--booking-inset)] border border-[var(--booking-border)] rounded-lg px-4 py-3 text-[var(--booking-text)] text-sm focus:outline-none focus:border-secondary"
              />
            </div>
            <div>
              <label htmlFor="schedule-time" className="block text-xs font-bold text-[var(--booking-muted)] mb-2 text-left">Time</label>
              <select
                id="schedule-time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="w-full bg-[var(--booking-inset)] border border-[var(--booking-border)] rounded-lg px-4 py-3 text-[var(--booking-text)] text-sm focus:outline-none focus:border-secondary"
              >
                <option value="">Select time</option>
                {Array.from({ length: 14 }, (_, i) => {
                  const hour = 8 + i;
                  const timeStr = `${String(hour).padStart(2, '0')}:00`;
                  return <option key={timeStr} value={timeStr}>{timeStr}</option>;
                })}
              </select>
            </div>
            <button
              type="button"
              onClick={() => {
                if (!scheduleDate || !scheduleTime) return;
                setStep('select-court');
              }}
              disabled={!scheduleDate || !scheduleTime || new Date(localDateTimeToIso(scheduleDate, scheduleTime)) <= new Date()}
              className="w-full py-4 px-6 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-sm uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-emerald-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continue
            </button>
          </div>
        </div>
      );

    case 'select-court':
      return withLayout(
        <SelectCourt member={member} courts={courts} onSelect={handleSelectCourt} onBack={handleBack} />
      );

    case 'guest-booking':
      return withLayout(
        config && <GuestBookingForm courts={courts.filter(c => c.status !== 'Maintenance' && c.status !== 'Closed')} durations={config.durations} onSubmit={handleGuestBooking} onBack={reset} busy={busy} />
      );

    case 'select-game':
      return withLayout(
        <SelectGameType member={member} onSelect={handleSelectGame} onBack={handleBack} onCancel={reset} />
      );

    case 'select-duration':
      return withLayout(
        config && (
          <SelectDuration
            member={member}
            durations={activeGame ? config.durations.filter((d) => d <= 60) : config.durations}
            rates={config.rates}
            onSelect={handleSelectDuration}
            onBack={handleBack}
            onCancel={reset}
            subtitle={activeGame ? 'Max 1 hour while currently in game (to give other players a turn).' : undefined}
          />
        )
      );

    case 'confirm':
      return withLayout(
        member && selectedCourt && gameType && duration && (
          <ConfirmBooking
            member={member}
            courtName={selectedCourt.name}
            gameType={gameType}
            duration={duration}
            creditsRequired={creditsRequired}
            balance={member.balance}
            matchTitle={matchTitle}
            onMatchTitleChange={setMatchTitle}
            onConfirm={handleJoinQueue}
            onBack={handleBack}
            onCancel={reset}
            busy={busy}
            scheduledStart={scheduleMode && scheduleDate && scheduleTime ? localDateTimeToIso(scheduleDate, scheduleTime) : undefined}
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

    case 'guest-success':
      return withLayout(
        guestRequest && <GuestBookingSuccess referenceCode={guestRequest.referenceCode} holdExpiresAt={guestRequest.holdExpiresAt} onDone={reset} />
      );

    case 'schedule-success':
      return withLayout(
        scheduledBooking && (
          <div className="min-h-full flex flex-col items-center justify-center p-8 text-center animate-fade-in">
            <div className="size-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-4 text-emerald-500">
              <CalendarCheck className="size-6" />
            </div>
            <h2 className="text-lg font-black text-[var(--booking-text)] tracking-wide mb-2">Booking Scheduled</h2>
            <div className="bg-[var(--booking-card)] border border-[var(--booking-border)] rounded-2xl p-5 mb-8 w-full max-w-sm text-left shadow-xs space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-widest">Booking ID</span>
                <span className="text-xs font-black text-[var(--booking-text)]">{scheduledBooking.id}</span>
              </div>
              <div className="h-px bg-[var(--booking-border)]/60" />
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-widest">Court</span>
                <span className="text-xs font-black text-[var(--booking-text)]">{scheduledBooking.courtName}</span>
              </div>
              <div className="h-px bg-[var(--booking-border)]/60" />
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-widest">Date/Time</span>
                <span className="text-xs font-black text-[var(--booking-text)]">{new Date(scheduledBooking.start).toLocaleString()}</span>
              </div>
              <div className="h-px bg-[var(--booking-border)]/60" />
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-bold text-[var(--booking-muted)] uppercase tracking-widest">Duration</span>
                <span className="text-xs font-black text-[var(--booking-text)]">{scheduledBooking.duration} min</span>
              </div>
            </div>
            <button
              type="button"
              onClick={reset}
              className="w-full py-3.5 px-6 rounded-xl bg-secondary hover:bg-secondary/90 text-white font-extrabold text-xs uppercase tracking-wider active:scale-[0.98] transition-all cursor-pointer shadow-md shadow-emerald-500/10"
            >
              Done
            </button>
          </div>
        )
      );

      default:
        return withLayout(
          <IdleScreen rfidRef={rfidRef} onRfidSubmit={handleRfidSubmit} onGuestBooking={() => { setErrorInfo(null); setStep('guest-booking'); }} />
        );
    }
  };

  return (
    <>
      {renderStep()}
      {/* Persistent badges for permanent states */}
      {nfcStatus === 'unsupported' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-3 py-1.5 rounded-lg text-xs font-medium z-50 whitespace-nowrap">
          NFC Not Supported (Requires Android Chrome)
        </div>
      )}
      {nfcStatus === 'waiting_for_interaction' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-amber-500/90 text-black px-3 py-1.5 rounded-lg text-xs font-medium z-50 whitespace-nowrap">
          Tap anywhere to enable NFC
        </div>
      )}
      {nfcStatus === 'error' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-500/90 text-white px-3 py-1.5 rounded-lg text-xs font-medium z-50 whitespace-nowrap">
          NFC Permission Denied
        </div>
      )}
      {/* Active badge — auto-hides after 3s with fade */}
      <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 bg-[#32A45E]/95 text-white px-3 py-1.5 rounded-lg text-xs font-medium z-50 whitespace-nowrap transition-opacity duration-700 ${nfcBadgeVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        ✓ NFC Scanner Active
      </div>
    </>
  );
}
