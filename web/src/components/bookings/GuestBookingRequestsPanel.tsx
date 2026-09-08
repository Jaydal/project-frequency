'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CheckCircle2, XCircle, AlertCircle, Receipt, CreditCard, Clock, Check, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface RequestRow {
  id: string;
  status: 'Pending Confirmation' | 'Confirmed' | 'Declined' | 'Expired' | string;
  reference_code: string;
  guest_name: string;
  mobile_number: string;
  email: string | null;
  start_time: string;
  duration: number;
  party_size: number;
  payment_method: string;
  payment_status: string;
  payment_reference?: string | null;
  payment_details?: string | null;
  admin_notes?: string | null;
  hold_expires_at: string;
  created_at: string;
  reviewed_at?: string | null;
  courts?: { name: string } | null;
}

function getDefaultPrice(duration: number): number {
  if (duration <= 15) return 100;
  if (duration <= 30) return 150;
  if (duration <= 60) return 300;
  if (duration <= 90) return 450;
  return 450;
}

export function GuestBookingRequestsPanel({ compact = false }: { compact?: boolean }) {
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [activeTab, setActiveTab] = useState<'pending' | 'confirmed' | 'history'>('pending');

  // Confirmation Modal State
  const [confirmModalItem, setConfirmModalItem] = useState<RequestRow | null>(null);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [amountPaid, setAmountPaid] = useState<number | string>('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [confirmError, setConfirmError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/guest-booking-requests', { cache: 'no-store' });
      if (!res.ok) throw new Error('Unable to load guest requests.');
      setRequests(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load guest requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 30_000);
    return () => window.clearInterval(id);
  }, [load]);

  function openConfirmModal(item: RequestRow) {
    setConfirmModalItem(item);
    setPaymentReference('');
    setPaymentMethod(item.payment_method || 'E-wallet');
    setAmountPaid(getDefaultPrice(item.duration));
    setPaymentDetails('');
    setConfirmError('');
  }

  function closeConfirmModal() {
    setConfirmModalItem(null);
    setConfirmError('');
    setSubmitting(false);
  }

  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmModalItem) return;

    if (!paymentReference.trim()) {
      setConfirmError('Proof of payment (Reference number / Transaction ID) is required.');
      return;
    }

    setSubmitting(true);
    setConfirmError('');

    try {
      const res = await fetch(`/api/guest-booking-requests/${confirmModalItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'approve',
          paymentReference: paymentReference.trim(),
          paymentMethod: paymentMethod.trim() || confirmModalItem.payment_method,
          amountPaid: Number(amountPaid) || 0,
          paymentDetails: paymentDetails.trim() || undefined,
          adminNotes: paymentDetails.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to approve guest booking request.');
      }

      setSuccessMsg(`Booking for ${confirmModalItem.guest_name} confirmed with ref #${paymentReference.trim()}!`);
      setTimeout(() => setSuccessMsg(''), 6000);
      closeConfirmModal();
      await load();
    } catch (err: any) {
      setConfirmError(err.message || 'Unable to confirm request.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject(id: string, name: string) {
    if (!window.confirm(`Are you sure you want to decline the booking request for ${name}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/guest-booking-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline' }),
      });
      if (res.ok) {
        setRequests(current => current.map(item => item.id === id ? { ...item, status: 'Declined' } : item));
      } else {
        const data = await res.json();
        setError(data.error ?? 'Unable to decline request');
      }
    } catch (err: any) {
      setError(err.message || 'Unable to decline request');
    }
  }

  const pendingRequests = requests.filter(r => r.status === 'Pending Confirmation');
  const confirmedRequests = requests.filter(r => r.status === 'Confirmed');
  const historyRequests = requests.filter(r => r.status === 'Expired' || r.status === 'Declined');

  const visibleRequests = compact
    ? pendingRequests.slice(0, 5)
    : activeTab === 'pending'
    ? pendingRequests
    : activeTab === 'confirmed'
    ? confirmedRequests
    : historyRequests;

  return (
    <div className="space-y-4">
      {/* Header & Refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-zinc-400">
          Pending requests are held for 30 minutes while staff confirms payment and schedule.
        </p>
        <button
          type="button"
          onClick={load}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-700 px-2.5 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-zinc-800 transition-colors"
          aria-label="Refresh guest requests"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          <AlertCircle size={16} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">
          <CheckCircle2 size={16} className="shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Tabs (non-compact mode) */}
      {!compact && (
        <div className="flex border-b border-zinc-800 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`pb-2 px-3 text-xs font-bold transition-colors flex items-center gap-1.5 border-b-2 ${
              activeTab === 'pending'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Pending Review
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-300">
              {pendingRequests.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('confirmed')}
            className={`pb-2 px-3 text-xs font-bold transition-colors flex items-center gap-1.5 border-b-2 ${
              activeTab === 'confirmed'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Confirmed
            <span className="rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/40 px-1.5 py-0.2 text-[10px]">
              {confirmedRequests.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2 px-3 text-xs font-bold transition-colors flex items-center gap-1.5 border-b-2 ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Declined / Expired
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.2 text-[10px] text-zinc-400">
              {historyRequests.length}
            </span>
          </button>
        </div>
      )}

      {loading && <p className="text-sm text-zinc-500 py-4">Loading guest requests…</p>}

      {!loading && visibleRequests.length === 0 && (
        <p className="py-8 text-center text-sm text-zinc-500">
          {compact || activeTab === 'pending'
            ? 'No pending guest booking requests.'
            : activeTab === 'confirmed'
            ? 'No confirmed guest bookings yet.'
            : 'No declined or expired requests.'}
        </p>
      )}

      {/* Requests List */}
      <div className="space-y-3">
        {visibleRequests.map(item => (
          <div key={item.id} className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-4 transition-colors hover:border-zinc-700/60">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-zinc-100">{item.guest_name}</p>
                  <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                    {item.reference_code}
                  </span>
                  {item.status === 'Confirmed' && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-800 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      Confirmed
                    </span>
                  )}
                  {item.status === 'Declined' && (
                    <span className="text-[10px] font-bold text-red-400 bg-red-950/80 border border-red-800 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      Declined
                    </span>
                  )}
                  {item.status === 'Expired' && (
                    <span className="text-[10px] font-bold text-amber-400 bg-amber-950/80 border border-amber-800 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                      Expired Hold
                    </span>
                  )}
                </div>

                <p className="text-xs text-zinc-400">
                  {item.mobile_number}
                  {item.email ? ` · ${item.email}` : ''}
                </p>

                <p className="text-sm text-zinc-300 flex items-center gap-2 pt-1">
                  <span>{item.courts?.name ?? 'Court'}</span>
                  <span>·</span>
                  <span>{new Date(item.start_time).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                  <span>·</span>
                  <span>{item.duration} min</span>
                  <span>·</span>
                  <span>{item.party_size === 4 ? 'Doubles (2v2)' : 'Singles (1v1)'}</span>
                </p>

                <div className="text-xs text-zinc-500 pt-1 space-y-0.5">
                  <p>
                    Requested Method: <span className="text-zinc-300 font-medium">{item.payment_method === 'Walk-in' ? 'Cash walk-in' : item.payment_method}</span>
                    {item.status === 'Pending Confirmation' && (
                      <span className="ml-2 text-zinc-400">
                        (Hold expires {new Date(item.hold_expires_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                      </span>
                    )}
                  </p>

                  {/* Proof of Payment details if Confirmed */}
                  {item.status === 'Confirmed' && item.payment_reference && (
                    <div className="mt-2 rounded-lg bg-emerald-950/20 border border-emerald-800/30 p-2.5 text-xs text-zinc-300">
                      <div className="flex items-center gap-1.5 font-bold text-emerald-400">
                        <Receipt size={13} />
                        <span>Proof of Payment Verified</span>
                      </div>
                      <p className="mt-1 font-mono text-zinc-200">
                        Ref #: <span className="font-bold text-white">{item.payment_reference}</span>
                      </p>
                      {item.payment_details && (
                        <p className="mt-0.5 text-zinc-400">
                          Details: {item.payment_details}
                        </p>
                      )}
                      {item.admin_notes && item.admin_notes !== item.payment_details && (
                        <p className="mt-0.5 text-zinc-500 italic">
                          Staff note: {item.admin_notes}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action buttons for pending items */}
              {item.status === 'Pending Confirmation' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleReject(item.id, item.guest_name)}
                    className="rounded-lg border border-red-900/60 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/50 cursor-pointer transition-colors"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    onClick={() => openConfirmModal(item)}
                    className="rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-500 cursor-pointer transition-colors shadow-xs flex items-center gap-1.5"
                  >
                    <Check size={14} />
                    <span>Confirm payment & schedule</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Proof of Payment Confirmation Modal */}
      {confirmModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                  <Receipt className="text-emerald-400 size-5" />
                  <span>Confirm Guest Payment & Schedule</span>
                </h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Add proof of payment / reference details before approving this booking.
                </p>
              </div>
              <button
                type="button"
                onClick={closeConfirmModal}
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer p-1 rounded-md"
              >
                <X size={18} />
              </button>
            </div>

            {/* Summary Box */}
            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-1.5 text-xs text-zinc-300">
              <div className="flex justify-between font-medium">
                <span className="text-zinc-400">Guest:</span>
                <span className="font-bold text-zinc-100">{confirmModalItem.guest_name} ({confirmModalItem.mobile_number})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Court & Time:</span>
                <span>{confirmModalItem.courts?.name ?? 'Court'} · {new Date(confirmModalItem.start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Duration & Format:</span>
                <span>{confirmModalItem.duration} min · {confirmModalItem.party_size === 4 ? 'Doubles (2v2)' : 'Singles (1v1)'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Booking Code:</span>
                <span className="font-mono text-emerald-400 font-bold">{confirmModalItem.reference_code}</span>
              </div>
            </div>

            {/* Form */}
            <form onSubmit={handleConfirmSubmit} className="space-y-4">
              {confirmError && (
                <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300 flex items-center gap-2">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>{confirmError}</span>
                </div>
              )}

              {/* Payment Reference Number (REQUIRED) */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <Label htmlFor="paymentReference" className="text-xs font-semibold text-zinc-200">
                    Payment Reference / Proof Number <span className="text-red-400">*</span>
                  </Label>
                  <span className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Required</span>
                </div>
                <Input
                  id="paymentReference"
                  required
                  autoFocus
                  placeholder="e.g. GCash Ref 1002 8391 8821 / BPI 94821 / Receipt #0124"
                  value={paymentReference}
                  onChange={e => setPaymentReference(e.target.value)}
                  className="bg-zinc-950/80 border-zinc-700 text-sm focus-visible:ring-emerald-500 font-mono"
                />
                <p className="text-[11px] text-zinc-500">
                  Transaction ID, GCash/Maya reference number, or physical receipt number.
                </p>
              </div>

              {/* Payment Method & Amount */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="paymentMethod" className="text-xs font-semibold text-zinc-200">
                    Verified Method
                  </Label>
                  <select
                    id="paymentMethod"
                    value={paymentMethod}
                    onChange={e => setPaymentMethod(e.target.value)}
                    className="w-full h-9 rounded-md border border-zinc-700 bg-zinc-950/80 px-3 py-1 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="E-wallet">E-wallet (GCash / Maya)</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Walk-in">Cash (Front Desk)</option>
                    <option value="Card">Credit / Debit Card</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="amountPaid" className="text-xs font-semibold text-zinc-200">
                    Amount Paid (₱)
                  </Label>
                  <Input
                    id="amountPaid"
                    type="number"
                    min={0}
                    step={1}
                    value={amountPaid}
                    onChange={e => setAmountPaid(e.target.value)}
                    className="bg-zinc-950/80 border-zinc-700 text-sm focus-visible:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Additional Notes / Details */}
              <div className="space-y-1.5">
                <Label htmlFor="paymentDetails" className="text-xs font-semibold text-zinc-200">
                  Payment Details / Verification Notes <span className="text-zinc-500 font-normal">(Optional)</span>
                </Label>
                <textarea
                  id="paymentDetails"
                  rows={2}
                  placeholder="e.g. Sender: Maria Santos (0917-xxx-xxxx), verified in GCash app at 10:15 AM."
                  value={paymentDetails}
                  onChange={e => setPaymentDetails(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950/80 p-2.5 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 resize-none"
                />
              </div>

              {/* Modal Buttons */}
              <div className="flex justify-end gap-2.5 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={closeConfirmModal}
                  disabled={submitting}
                  className="border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting || !paymentReference.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  {submitting ? 'Confirming...' : 'Confirm & Schedule Booking'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

