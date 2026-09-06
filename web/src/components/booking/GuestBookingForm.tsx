'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, Check, Clock, CreditCard, MapPin, UserRound } from 'lucide-react';
import { BookingStepper } from './BookingStepper';

interface Court { id: string; name: string; }
type PaymentMethod = 'E-wallet' | 'Bank Transfer' | 'Walk-in';

export const GUEST_BOOKING_STEP_LABELS = ['Contact', 'Court & time', 'Format', 'Review'];
export const GUEST_MOBILE_GRID_CLASS = 'grid-cols-1 min-[380px]:grid-cols-2';

interface Props {
  courts: Court[];
  durations: number[];
  onSubmit: (data: { guestName: string; mobileNumber: string; email: string; courtId: string; start: string; duration: number; partySize: number; paymentMethod: PaymentMethod }) => void;
  onBack: () => void;
  busy?: boolean;
}

const fieldClass = 'mt-1 w-full rounded-xl border border-[#40584a] bg-[#15231d] px-3.5 py-3 text-sm text-[#FCFCF6] outline-none transition focus:border-[#7bd694] focus:ring-2 focus:ring-[#32A45E]/20';
const choiceClass = 'rounded-2xl border border-[#40584a] bg-[#203229] p-4 text-left transition hover:border-[#32A45E]/60 hover:bg-[#294335] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694] active:scale-[0.98]';

export function GuestBookingForm({ courts, durations, onSubmit, onBack, busy }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = React.useState(0);
  const [date, setDate] = React.useState(today);
  const [time, setTime] = React.useState('');
  const [courtId, setCourtId] = React.useState(courts[0]?.id ?? '');
  const [duration, setDuration] = React.useState(durations[0] ?? 60);
  const [availableTimes, setAvailableTimes] = React.useState<string[]>([]);
  const [loadingTimes, setLoadingTimes] = React.useState(false);
  const [partySize, setPartySize] = React.useState(2);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('Walk-in');
  const [guestName, setGuestName] = React.useState('');
  const [mobileNumber, setMobileNumber] = React.useState('');
  const [email, setEmail] = React.useState('');

  React.useEffect(() => {
    if (!courtId || !date) return;
    let cancelled = false;
    setLoadingTimes(true);
    fetch(`/api/bookings/availability?courtId=${encodeURIComponent(courtId)}&date=${date}&duration=${duration}`)
      .then(response => response.json())
      .then(data => {
        if (cancelled) return;
        const now = new Date();
        const times = (data.slots ?? []).filter((slot: { time: string; available: boolean }) => {
          if (!slot.available) return false;
          if (date !== today) return true;
          const [hours, minutes] = slot.time.split(':').map(Number);
          return hours * 60 + minutes > now.getHours() * 60 + now.getMinutes();
        }).map((slot: { time: string }) => slot.time);
        setAvailableTimes(times);
        setTime(current => times.includes(current) ? current : (times[0] ?? ''));
      })
      .catch(() => { if (!cancelled) { setAvailableTimes([]); setTime(''); } })
      .finally(() => { if (!cancelled) setLoadingTimes(false); });
    return () => { cancelled = true; };
  }, [courtId, date, duration, today]);

  const canContinue = step === 0
    ? guestName.trim().length >= 2 && mobileNumber.trim().length >= 7
    : step === 1 ? Boolean(courtId && time && !loadingTimes) : true;

  function goBack() { if (step === 0) onBack(); else setStep(current => current - 1); }
  function localDateTimeToIso(dateValue: string, timeValue: string): string {
    const [year, month, day] = dateValue.split('-').map(Number);
    const [hours, minutes] = timeValue.split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes).toISOString();
  }

  function submit() { onSubmit({ guestName, mobileNumber, email, courtId, start: localDateTimeToIso(date, time), duration, partySize, paymentMethod }); }

  return (
    <div className="flex min-h-full flex-1 flex-col overflow-y-auto">
      <BookingStepper current={step as 0 | 1 | 2 | 3} steps={GUEST_BOOKING_STEP_LABELS} onCancel={onBack} />
      <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="mb-4 sm:mb-5"><p className="text-lg font-black tracking-tight text-[#f3f6f2] sm:text-xl">{GUEST_BOOKING_STEP_LABELS[step]}</p><p className="mt-1 text-xs text-[#9eaca3]">{step === 0 ? 'Tell us how Paddle Point can reach you.' : step === 1 ? 'Choose a court and an available time.' : step === 2 ? 'Set the format and length of your session.' : 'Check the details before sending your request.'}</p></div>

        <div className="flex-1">
          {step === 0 && <div className="grid gap-4 sm:grid-cols-2"><Field label="Full name" icon={<UserRound size={15} />}><input required autoFocus minLength={2} value={guestName} onChange={e => setGuestName(e.target.value)} className={fieldClass} placeholder="Your name" /></Field><Field label="Mobile number" icon={<span className="text-xs">+63</span>}><input required minLength={7} value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} className={fieldClass} placeholder="09XX XXX XXXX" /></Field><Field label="Email (optional)" className="sm:col-span-2"><input type="email" value={email} onChange={e => setEmail(e.target.value)} className={fieldClass} placeholder="you@example.com" /></Field><div className="sm:col-span-2 rounded-xl border border-[#294033] bg-[#16271d] p-4 text-xs text-[#9eaca3]">Your information is used only so Paddle Point staff can confirm your schedule and payment.</div></div>}

          {step === 1 && <div className="space-y-5"><Field label="Court" icon={<MapPin size={15} />}><div className={`${GUEST_MOBILE_GRID_CLASS} gap-3`}>{courts.map(court => <button type="button" key={court.id} onClick={() => { setCourtId(court.id); setTime(''); }} className={`${choiceClass} ${courtId === court.id ? 'border-[#32A45E] bg-[#294335] ring-1 ring-[#32A45E]/50' : ''}`}><span className="block text-sm font-bold text-[#f3f6f2]">{court.name}</span><span className="mt-1 block text-[10px] text-[#9eaca3]">Tap to choose</span></button>)}</div></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Date"><input required type="date" min={today} value={date} onChange={e => { setDate(e.target.value); setTime(''); }} className={fieldClass} /></Field><Field label="Available start time" icon={<Clock size={15} />}><select required value={time} onChange={e => setTime(e.target.value)} disabled={loadingTimes || availableTimes.length === 0} className={fieldClass}><option value="">{loadingTimes ? 'Checking availability…' : availableTimes.length ? 'Select a time' : 'No available times'}</option>{availableTimes.map(slot => <option key={slot} value={slot}>{slot}</option>)}</select></Field></div></div>}

          {step === 2 && <div className="space-y-5"><Field label="Game format"><div className="grid grid-cols-2 gap-3"><button type="button" onClick={() => setPartySize(2)} className={`${choiceClass} ${partySize === 2 ? 'border-[#32A45E] bg-[#294335] ring-1 ring-[#32A45E]/50' : ''}`}><span className="text-sm font-bold text-[#f3f6f2]">Singles</span><span className="mt-1 block text-[10px] text-[#9eaca3]">2 players</span></button><button type="button" onClick={() => setPartySize(4)} className={`${choiceClass} ${partySize === 4 ? 'border-[#32A45E] bg-[#294335] ring-1 ring-[#32A45E]/50' : ''}`}><span className="text-sm font-bold text-[#f3f6f2]">Doubles</span><span className="mt-1 block text-[10px] text-[#9eaca3]">4 players</span></button></div></Field><Field label="Session duration"><div className="grid grid-cols-3 gap-3">{durations.map(value => <button type="button" key={value} onClick={() => setDuration(value)} className={`${choiceClass} text-center ${duration === value ? 'border-[#32A45E] bg-[#294335] ring-1 ring-[#32A45E]/50' : ''}`}><Clock className="mx-auto mb-2 text-[#7bd694]" size={17} /><span className="block text-lg font-black text-[#f3f6f2]">{value}</span><span className="text-[10px] text-[#9eaca3]">minutes</span></button>)}</div></Field></div>}

          {step === 3 && <div className="space-y-4"><div className="rounded-2xl border border-[#40584a] bg-[#203229] p-4"><SummaryRow label="Guest" value={guestName} /><SummaryRow label="Court" value={courts.find(court => court.id === courtId)?.name ?? 'Court'} /><SummaryRow label="Schedule" value={`${new Date(`${date}T${time}:00`).toLocaleDateString()} · ${time}`} /><SummaryRow label="Session" value={`${partySize === 4 ? 'Doubles' : 'Singles'} · ${duration} minutes`} /></div><Field label="How will you pay?" icon={<CreditCard size={15} />}><div className="grid gap-2 sm:grid-cols-3">{(['Walk-in', 'E-wallet', 'Bank Transfer'] as PaymentMethod[]).map(method => <button type="button" key={method} onClick={() => setPaymentMethod(method)} className={`${choiceClass} ${paymentMethod === method ? 'border-[#32A45E] bg-[#294335] ring-1 ring-[#32A45E]/50' : ''}`}><span className="text-xs font-bold text-[#f3f6f2]">{method === 'Walk-in' ? 'Cash walk-in' : method}</span></button>)}</div></Field><p className="rounded-xl border border-[#d9a441]/25 bg-[#d9a441]/10 p-3 text-xs leading-relaxed text-[#e7c77a]">This sends a request, not a final booking. Paddle Point staff will contact you to confirm the schedule and payment.</p></div>}
        </div>

        <div className="mt-5 flex shrink-0 gap-2.5 sm:mt-6 sm:gap-3"><button type="button" onClick={goBack} className="flex-1 rounded-xl border border-[#536a5c] bg-[#1b2a23] px-3 py-3.5 text-xs font-extrabold uppercase tracking-wider text-[#d9e3dc] hover:bg-[#24372e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694]"><ArrowLeft className="mr-1.5 inline" size={15} />Back</button>{step < 3 ? <button type="button" disabled={!canContinue} onClick={() => setStep(current => current + 1)} className="flex-[2] rounded-xl bg-[#32A45E] px-3 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-[#3bb86b] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694]"><span>Continue</span><ArrowRight className="ml-1.5 inline" size={15} /></button> : <button type="button" disabled={busy} onClick={submit} className="flex-[2] rounded-xl bg-[#32A45E] px-3 py-3.5 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-[#3bb86b] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7bd694]">{busy ? 'Sending request…' : <><Check className="mr-1.5 inline" size={15} />Send booking request</>}</button>}</div>
      </div>
    </div>
  );
}

function Field({ label, icon, className = '', children }: { label: string; icon?: React.ReactNode; className?: string; children: React.ReactNode }) { return <label className={`block text-xs font-semibold text-[#aebbb2] ${className}`}><span className="flex items-center gap-1.5 uppercase tracking-wider">{icon}{label}</span>{children}</label>; }
function SummaryRow({ label, value }: { label: string; value: string }) { return <div className="flex items-center justify-between gap-4 border-b border-[#385044] py-3 last:border-0"><span className="text-[10px] font-bold uppercase tracking-wider text-[#829188]">{label}</span><span className="text-right text-sm font-bold text-[#f3f6f2]">{value}</span></div>; }
