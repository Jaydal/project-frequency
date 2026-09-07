'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { CourtGrid } from '@/components/bookings/CourtGrid';
import { TimeSlotGrid } from '@/components/bookings/TimeSlotGrid';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookingConfirmation } from '@/components/bookings/BookingConfirmation';
import { User, Wallet, AlertCircle, CheckCircle2, Search, Sun, Moon, ArrowLeft, Calendar, Clock } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';

interface Court { id: string; name: string; status: string; }

interface Member {
  id: string;
  member_id: string;
  first_name: string;
  last_name: string;
  balance: number;
}

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
  const [price, setPrice] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Member management
  const [isStaff, setIsStaff] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [loadingUser, setLoadingUser] = useState(true);
  const [hasUser, setHasUser] = useState(false);

  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  useEffect(() => {
    const supabase = createClient();
    supabase.from('courts').select('id, name, status').order('name', { ascending: true }).then(({ data }) => {
      if (data) setCourts(data);
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setHasUser(false);
        setLoadingUser(false);
        return;
      }
      setHasUser(true);

      const staffRole =
        user.app_metadata?.role === 'admin' ||
        user.app_metadata?.role === 'staff' ||
        user.user_metadata?.role === 'admin' ||
        user.user_metadata?.role === 'staff';

      setIsStaff(Boolean(staffRole));

      if (staffRole) {
        // Staff can book for any active member
        const { data } = await supabase
          .from('members')
          .select('id, member_id, first_name, last_name, wallets(balance)')
          .eq('status', 'Active')
          .order('first_name', { ascending: true });

        if (data) {
          const mapped: Member[] = data.map((m: any) => ({
            id: m.id,
            member_id: m.member_id,
            first_name: m.first_name,
            last_name: m.last_name,
            balance: Number(m.wallets?.[0]?.balance ?? m.wallets?.balance ?? 0),
          }));
          setMembers(mapped);
          if (mapped.length > 0) {
            setSelectedMember(mapped[0]);
          }
        }
      } else {
        // Regular user: find member linked to their user id
        const { data: m } = await supabase
          .from('members')
          .select('id, member_id, first_name, last_name, wallets(balance)')
          .eq('id', user.id)
          .maybeSingle();

        if (m) {
          setSelectedMember({
            id: m.id,
            member_id: m.member_id,
            first_name: m.first_name,
            last_name: m.last_name,
            balance: Number((m as any).wallets?.[0]?.balance ?? (m as any).wallets?.balance ?? 0),
          });
        }
      }
      setLoadingUser(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedCourt) return;
    fetch(`/api/bookings/availability?courtId=${selectedCourt.id}&date=${date}&duration=${duration}`)
      .then((r) => r.json())
      .then((data) => setSlots(data.slots ?? []));
  }, [selectedCourt, date, duration]);

  useEffect(() => {
    if (!duration || !gameType) return;
    fetch('/api/public/prices')
      .then((r) => r.json())
      .then((data) => {
        const prices = data.prices ?? { '30': 150, '60': 300, '90': 450 };
        const rate = prices[String(duration)] ?? 0;
        const cost = Math.round((rate * (duration / 30)) / (gameType === '2v2' ? 2 : 1));
        setPrice(cost);
      });
  }, [duration, gameType]);

  const filteredMembers = useMemo(() => {
    if (!memberSearch.trim()) return members;
    const term = memberSearch.toLowerCase();
    return members.filter(
      (m) =>
        m.first_name.toLowerCase().includes(term) ||
        m.last_name.toLowerCase().includes(term) ||
        m.member_id.toLowerCase().includes(term)
    );
  }, [members, memberSearch]);

  const hasInsufficientCredits =
    price !== null && selectedMember !== null && selectedMember.balance < price;

  async function handleConfirm() {
    if (!selectedMember) {
      setError('Please select a member for this booking.');
      return;
    }
    if (hasInsufficientCredits) {
      setError(`Insufficient wallet balance. Member has ₱${selectedMember.balance.toFixed(2)}, but ₱${price} is required.`);
      return;
    }
    if (!selectedCourt) {
      setError('Please select a court.');
      return;
    }
    if (!selectedTime) {
      setError('Please select a time slot.');
      return;
    }

    setLoading(true);
    setError(null);
    const start = `${date}T${selectedTime}:00.000Z`;

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          memberId: selectedMember.id,
          courtId: selectedCourt.id,
          start,
          duration,
          partySize: gameType === '2v2' ? 4 : 2,
          playerIds: [selectedMember.id],
          matchTitle: matchTitle.trim() || undefined,
        }),
      });

      if (res.status === 401) {
        router.push(`/login?redirect=/book`);
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        const fieldDetails = data.details?.fieldErrors
          ? Object.entries(data.details.fieldErrors)
              .flatMap(([field, errors]) => `${field}: ${(errors as string[]).join(', ')}`)
              .join(' · ')
          : '';
        setError(fieldDetails || data.error || 'Failed to create booking');
        setLoading(false);
        return;
      }

      setBookingId(data.id);
    } catch (err: any) {
      setError(err?.message || 'Network error, please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-90">
            <img
              src="/brand/primary-logo.svg"
              alt="Paddle Point"
              className="h-8 sm:h-9 w-auto object-contain"
            />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/booking/queue"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              Live Queue
            </Link>
            <Link
              href="/bookings"
              className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-md hover:bg-muted"
            >
              My Bookings
            </Link>
            {mounted && (
              <button
                type="button"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
                className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
              >
                {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto py-8 sm:py-12 px-4 space-y-6 sm:space-y-8">
        {bookingId ? (
          <BookingConfirmation
            booking={{
              id: bookingId,
              status: 'Scheduled',
              court_id: selectedCourt?.id ?? null,
              start_time: `${date}T${selectedTime}:00.000Z`,
              duration,
            }}
            courtName={selectedCourt?.name}
          />
        ) : (
          <>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">Schedule Court Booking</h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-1">Reserve a court ahead of time with automated queue processing.</p>
            </div>

            {/* Member Selection Section */}
            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-sm sm:text-base flex items-center gap-2 text-foreground">
                  <User size={18} className="text-emerald-500" />
                  {isStaff ? 'Select Player / Member' : 'Member Account'}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                {loadingUser ? (
                  <p className="text-sm text-muted-foreground">Loading user profile...</p>
                ) : isStaff ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Search member by name or member ID..."
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                        className="w-full bg-background border border-border rounded-lg pl-9 pr-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      />
                    </div>

                    {filteredMembers.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                        {filteredMembers.map((m) => {
                          const isSelected = selectedMember?.id === m.id;
                          return (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => setSelectedMember(m)}
                              className={`p-3 rounded-lg text-left border transition-all text-xs flex flex-col justify-between gap-1 cursor-pointer ${
                                isSelected
                                  ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500 text-foreground'
                                  : 'bg-muted/40 border-border hover:border-primary/50 text-foreground'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-foreground truncate">{m.first_name} {m.last_name}</span>
                                {isSelected && <CheckCircle2 size={14} className="text-emerald-500" />}
                              </div>
                              <div className="flex items-center justify-between text-muted-foreground">
                                <span>ID: {m.member_id}</span>
                                <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">₱{m.balance.toFixed(2)}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground py-2">No active members found matching query.</p>
                    )}

                    {selectedMember && (
                      <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs">
                        <div className="flex items-center gap-2">
                          <Wallet size={15} className="text-emerald-500" />
                          <span className="text-foreground">
                            Booking for: <strong className="text-foreground font-bold">{selectedMember.first_name} {selectedMember.last_name}</strong> ({selectedMember.member_id})
                          </span>
                        </div>
                        <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                          Wallet: ₱{selectedMember.balance.toFixed(2)}
                        </span>
                      </div>
                    )}
                  </div>
                ) : selectedMember ? (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs">
                    <div className="flex items-center gap-2">
                      <User size={15} className="text-emerald-500" />
                      <span className="text-foreground">
                        Logged in as: <strong className="text-foreground font-bold">{selectedMember.first_name} {selectedMember.last_name}</strong> ({selectedMember.member_id})
                      </span>
                    </div>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                      Balance: ₱{selectedMember.balance.toFixed(2)}
                    </span>
                  </div>
                ) : !hasUser ? (
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle size={16} />
                      <span>Please log in to your account to book a court.</span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => router.push('/login?redirect=/book')}
                      className="border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 text-xs"
                    >
                      Log In
                    </Button>
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-2">
                    <AlertCircle size={15} />
                    <span>No member record linked to this login account. Please contact an administrator or register an RFID card.</span>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-sm sm:text-base text-foreground">Select Court</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <CourtGrid courts={courts} selectedCourtId={selectedCourt?.id} onSelect={setSelectedCourt} />
              </CardContent>
            </Card>

            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-sm sm:text-base text-foreground">Select Date</CardTitle>
              </CardHeader>
              <CardContent className="pt-4">
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  max={maxDate}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </CardContent>
            </Card>

            {selectedCourt && (
              <Card className="border-border bg-card shadow-xs">
                <CardHeader className="border-b border-border/60 pb-3">
                  <CardTitle className="text-sm sm:text-base text-foreground">Select Time Slot ({selectedCourt.name})</CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <TimeSlotGrid slots={slots} selectedTime={selectedTime ?? undefined} onSelect={setSelectedTime} />
                </CardContent>
              </Card>
            )}

            <Card className="border-border bg-card shadow-xs">
              <CardHeader className="border-b border-border/60 pb-3">
                <CardTitle className="text-sm sm:text-base text-foreground">Booking Details & Payment</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Duration</Label>
                    <select
                      value={duration}
                      onChange={(e) => setDuration(Number(e.target.value))}
                      className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="30">30 minutes</option>
                      <option value="60">60 minutes</option>
                      <option value="90">90 minutes</option>
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Game Type</Label>
                    <select
                      value={gameType}
                      onChange={(e) => setGameType(e.target.value as '1v1' | '2v2')}
                      className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="1v1">1v1 Singles (2 players)</option>
                      <option value="2v2">2v2 Doubles (4 players)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">Match Title (optional)</Label>
                  <input
                    value={matchTitle}
                    onChange={(e) => setMatchTitle(e.target.value)}
                    placeholder="e.g. Weekly Club Match, Practice Rally..."
                    className="mt-1 w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {price !== null && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
                    <span className="text-xs text-muted-foreground">Estimated cost: ₱{price}</span>
                    <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400">₱{price.toFixed(2)}</span>
                  </div>
                )}

                {hasInsufficientCredits && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>
                      Insufficient balance: Member currently has ₱{selectedMember?.balance.toFixed(2)}, but ₱{price} is required. Please reload the wallet first.
                    </span>
                  </div>
                )}

                {error && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <Button
                  onClick={handleConfirm}
                  disabled={!selectedMember || !selectedCourt || !selectedTime || hasInsufficientCredits || loading}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  {loading ? 'Confirming Booking...' : 'Confirm Booking'}
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
