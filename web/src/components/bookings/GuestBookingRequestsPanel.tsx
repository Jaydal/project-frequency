'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

interface RequestRow {
  id: string;
  status: string;
  reference_code: string;
  guest_name: string;
  mobile_number: string;
  email: string | null;
  start_time: string;
  duration: number;
  party_size: number;
  payment_method: string;
  hold_expires_at: string;
  courts?: { name: string } | null;
}

export function GuestBookingRequestsPanel({ compact = false }: { compact?: boolean }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/guest-booking-requests', { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load guest requests.');
      setRequests(await res.json());
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load guest requests.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); const id = window.setInterval(load, 30_000); return () => window.clearInterval(id); }, [load]);

  async function review(id: string, action: 'confirm' | 'reject') {
    const apiAction = action === 'confirm' ? 'approve' : 'decline';
    const paymentStatus = action === 'confirm' ? 'Confirmed' : undefined;
    const res = await fetch(`/api/guest-booking-requests/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: apiAction, paymentStatus }),
    });
    if (res.ok) setRequests(current => current.filter(item => item.id !== id));
    else setError((await res.json()).error ?? 'Unable to update request');
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3"><p className="text-xs text-zinc-500">Pending requests are held for 30 minutes while staff confirms the schedule and payment.</p><button type="button" onClick={load} className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800" aria-label="Refresh guest requests"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button></div>
      {error && <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      {loading && <p className="text-sm text-zinc-500">Loading guest requests…</p>}
      {!loading && requests.filter(item => item.status !== 'Expired').length === 0 && <p className="py-6 text-center text-sm text-zinc-500">No pending guest booking requests.</p>}
      {requests.filter(item => item.status !== 'Expired').slice(0, compact ? 5 : undefined).map(item => (
        <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-bold text-zinc-100">{item.guest_name} <span className="ml-2 text-xs font-mono text-emerald-400">{item.reference_code}</span></p>
              <p className="text-xs text-zinc-400">{item.mobile_number}{item.email ? ` · ${item.email}` : ''}</p>
              <p className="mt-2 text-sm text-zinc-300">{item.courts?.name ?? 'Court'} · {new Date(item.start_time).toLocaleString()} · {item.duration} min · {item.party_size === 4 ? 'Doubles' : 'Singles'}</p>
              <p className="text-xs text-zinc-500">Payment: {item.payment_method === 'Walk-in' ? 'Cash walk-in' : item.payment_method} · Hold expires {new Date(item.hold_expires_at).toLocaleTimeString()}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => review(item.id, 'reject')} className="rounded-lg border border-red-900/60 px-3 py-2 text-xs font-bold text-red-300">Reject</button>
              <button onClick={() => review(item.id, 'confirm')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Confirm payment & schedule</button>
            </div>
          </div>
        </div>
      ))}
      {!compact && requests.filter(item => item.status === 'Expired').length > 0 && <details className="rounded-lg border border-zinc-800 bg-zinc-950/30 p-3"><summary className="cursor-pointer text-xs font-semibold text-zinc-500">Expired requests ({requests.filter(item => item.status === 'Expired').length})</summary><p className="mt-2 text-xs text-zinc-500">These holds can no longer be confirmed. Ask the guest to submit a new request.</p></details>}
    </div>
  );
}
