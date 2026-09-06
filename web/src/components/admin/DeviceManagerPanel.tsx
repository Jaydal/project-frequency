'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Monitor,
  Tv,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  ShieldAlert,
  Edit2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export interface RegisteredDevice {
  deviceId: string;
  deviceType: 'kiosk' | 'display';
  courtId: string | null;
  courtName: string | null;
  enabled: boolean;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface CourtOption {
  id: string;
  name: string;
}

function formatMac(mac: string): string {
  if (mac === 'simulator') return 'simulator';
  const clean = mac.replace(/[:-]/g, '').toLowerCase();
  if (clean.length === 12) {
    return clean.match(/.{1,2}/g)?.join(':') ?? clean;
  }
  return mac;
}

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diffSec = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export function DeviceManagerPanel() {
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Dialog State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formDeviceId, setFormDeviceId] = useState('');
  const [formDeviceType, setFormDeviceType] = useState<'kiosk' | 'display'>('kiosk');
  const [formCourtId, setFormCourtId] = useState<string>('');

  // Edit Court Modal/Inline State
  const [editingDevice, setEditingDevice] = useState<RegisteredDevice | null>(null);
  const [editCourtId, setEditCourtId] = useState<string>('');
  const [updating, setUpdating] = useState(false);

  const loadDevices = useCallback(async () => {
    setError('');
    try {
      const res = await fetch('/api/devices', { cache: 'no-store' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to fetch registered devices');
      }
      const data = await res.json();
      setDevices(data.devices || []);
      setCourts(data.courts || []);
    } catch (err: any) {
      setError(err.message || 'Unable to connect to devices service.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleCopy = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleEnabled = async (device: RegisteredDevice) => {
    const newStatus = !device.enabled;
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(device.deviceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update device status');
      }
      setDevices(prev =>
        prev.map(d => (d.deviceId === device.deviceId ? { ...d, enabled: newStatus } : d))
      );
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteDevice = async (device: RegisteredDevice) => {
    if (!confirm(`Are you sure you want to remove device "${device.deviceId}" from the allowlist? It will immediately lose access.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(device.deviceId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete device');
      }
      setDevices(prev => prev.filter(d => d.deviceId !== device.deviceId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSaveCourt = async () => {
    if (!editingDevice) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(editingDevice.deviceId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courtId: editCourtId || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update court');
      }
      const courtObj = courts.find(c => c.id === editCourtId);
      setDevices(prev =>
        prev.map(d =>
          d.deviceId === editingDevice.deviceId
            ? { ...d, courtId: editCourtId || null, courtName: courtObj?.name ?? null }
            : d
        )
      );
      setEditingDevice(null);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUpdating(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId: formDeviceId,
          deviceType: formDeviceType,
          courtId: formCourtId || null,
          enabled: true,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to register device');
      }

      setFormDeviceId('');
      setFormCourtId('');
      setIsAddOpen(false);
      await loadDevices();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
            <ShieldCheck className="text-emerald-400 size-5" />
            Device Allowlist Management
          </h2>
          <p className="text-sm text-zinc-400">
            Authorize ESP32 interactive kiosks and LED scoreboard displays. Only registered devices can connect to the API.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadDevices}
            disabled={loading}
            className="border-zinc-700 text-zinc-200 hover:bg-zinc-800"
          >
            <RefreshCw className={loading ? 'animate-spin size-4' : 'size-4'} /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setFormError('');
              setIsAddOpen(true);
            }}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5"
          >
            <Plus className="size-4" /> Add Device
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* Devices List Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-zinc-500">Loading registered devices…</p>
      ) : devices.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-950/30 px-6 py-12 text-center">
          <ShieldAlert className="mx-auto mb-3 text-zinc-500 size-8" />
          <p className="font-semibold text-zinc-200 text-base">No controller devices registered</p>
          <p className="mt-1 text-sm text-zinc-500 max-w-md mx-auto">
            Devices must be enrolled in the allowlist using their hardware MAC address before they can connect and authenticate.
          </p>
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="mt-4 bg-emerald-600 hover:bg-emerald-500 text-white"
          >
            <Plus className="size-4 mr-1" /> Register First Device
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950/50">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                  <th className="py-3 px-4">Hardware Device ID (MAC)</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Assigned Court</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Last Seen</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {devices.map(device => (
                  <tr key={device.deviceId} className="hover:bg-zinc-900/40 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-medium text-zinc-200">
                          {formatMac(device.deviceId)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(device.deviceId)}
                          title="Copy MAC address"
                          className="text-zinc-500 hover:text-zinc-300 transition-colors"
                        >
                          {copiedId === device.deviceId ? (
                            <Check className="size-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="size-3.5" />
                          )}
                        </button>
                      </div>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        raw: {device.deviceId}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {device.deviceType === 'kiosk' ? (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 gap-1 font-medium">
                          <Monitor className="size-3" /> Touch Kiosk
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-500/10 text-blue-300 border-blue-500/30 gap-1 font-medium">
                          <Tv className="size-3" /> LED Display
                        </Badge>
                      )}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="text-zinc-300">
                          {device.courtName || (device.deviceType === 'kiosk' ? 'Lobby / Unassigned' : 'Unassigned')}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingDevice(device);
                            setEditCourtId(device.courtId || '');
                          }}
                          className="text-zinc-500 hover:text-zinc-300 p-1 rounded hover:bg-zinc-800"
                          title="Edit court assignment"
                        >
                          <Edit2 className="size-3.5" />
                        </button>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleEnabled(device)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          device.enabled
                            ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-500/20'
                            : 'bg-red-500/10 text-red-300 border-red-500/20 hover:bg-red-500/20'
                        }`}
                      >
                        {device.enabled ? (
                          <>
                            <CheckCircle2 className="size-3 text-emerald-400" /> Active
                          </>
                        ) : (
                          <>
                            <XCircle className="size-3 text-red-400" /> Disabled
                          </>
                        )}
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-zinc-400 text-xs">
                      {timeAgo(device.lastSeenAt)}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteDevice(device)}
                        className="text-zinc-400 hover:text-red-400 hover:bg-red-500/10"
                        title="Revoke / Delete device"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Device Modal Dialog */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-100 flex items-center gap-2">
                <Plus className="text-emerald-400 size-5" />
                Register New Device
              </h3>
              <button
                type="button"
                onClick={() => setIsAddOpen(false)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-5" />
              </button>
            </div>

            {formError && (
              <p className="rounded-lg border border-red-500/20 bg-red-500/10 p-2.5 text-xs text-red-300">
                {formError}
              </p>
            )}

            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  MAC Address / Device ID
                </label>
                <Input
                  type="text"
                  placeholder="e.g. 24:4C:AB:12:34:56 or 244cab123456"
                  value={formDeviceId}
                  onChange={e => setFormDeviceId(e.target.value)}
                  required
                  className="bg-zinc-900 border-zinc-700 text-zinc-100 font-mono placeholder:text-zinc-600"
                />
                <p className="text-[11px] text-zinc-500 mt-1">
                  Found on the device boot screen, serial logs, or captive portal Wi-Fi status.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Device Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormDeviceType('kiosk')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                      formDeviceType === 'kiosk'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <Monitor className="size-4" /> Kiosk Terminal
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormDeviceType('display')}
                    className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-sm font-medium transition-all ${
                      formDeviceType === 'display'
                        ? 'border-blue-500 bg-blue-500/10 text-blue-300'
                        : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:bg-zinc-800'
                    }`}
                  >
                    <Tv className="size-4" /> LED Display
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Assigned Court (Optional)
                </label>
                <select
                  value={formCourtId}
                  onChange={e => setFormCourtId(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">None / Lobby (General)</option>
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-zinc-500 mt-1">
                  LED Scoreboards should be assigned to their corresponding court.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAddOpen(false)}
                  disabled={submitting}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submitting}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {submitting ? 'Registering…' : 'Register Device'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Court Assignment Modal Dialog */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl animate-fade-in space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Edit2 className="text-emerald-400 size-4" />
                Edit Court Assignment
              </h3>
              <button
                type="button"
                onClick={() => setEditingDevice(null)}
                className="text-zinc-500 hover:text-zinc-300"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-xs text-zinc-400">
                Device: <span className="font-mono text-zinc-200 font-semibold">{editingDevice.deviceId}</span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1">
                  Assigned Court
                </label>
                <select
                  value={editCourtId}
                  onChange={e => setEditCourtId(e.target.value)}
                  className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="">None / Lobby (General)</option>
                  {courts.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditingDevice(null)}
                  disabled={updating}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleSaveCourt}
                  disabled={updating}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white"
                >
                  {updating ? 'Saving…' : 'Save Changes'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
