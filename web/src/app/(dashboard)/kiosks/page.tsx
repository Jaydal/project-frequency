import { Monitor } from 'lucide-react';
import { KioskStatusPanel } from '@/components/admin/KioskStatusPanel';
import { DeviceManagerPanel } from '@/components/admin/DeviceManagerPanel';

export default function KiosksPage() {
  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-start gap-3">
        <Monitor className="mt-1 text-emerald-400" size={22} />
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-100">Kiosk & Device Management</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Authorize hardware devices, manage the allowlist, and monitor live heartbeat telemetry.
          </p>
        </div>
      </div>

      <DeviceManagerPanel />

      <div className="pt-4 border-t border-zinc-800/80 space-y-3">
        <h2 className="text-lg font-bold text-zinc-100">Live Heartbeat Telemetry</h2>
        <KioskStatusPanel />
      </div>
    </div>
  );
}

