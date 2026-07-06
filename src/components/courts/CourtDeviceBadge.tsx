'use client';

import { useEffect, useState } from 'react';

type StatusData = {
  status: 'online' | 'offline';
  ip?: string;
  rssi?: number;
  sim?: boolean;
  seenAt?: number;
} | undefined;

type Props = {
  courtId: string;
  initialStatus: StatusData;
};

export default function CourtDeviceBadge({ courtId, initialStatus }: Props) {
  const [data, setData] = useState<StatusData>(initialStatus);

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/courts/status', { cache: 'no-store' });
        const all = await res.json();
        setData(all[courtId]);
      } catch { /* keep last known */ }
    }
    poll();
    const t = setInterval(poll, 10_000);
    return () => clearInterval(t);
  }, [courtId]);

  const online = data?.status === 'online';
  const isSim  = data?.sim === true;

  const label = !data        ? 'ESP32 Unknown'
              : isSim        ? (online ? 'Simulator Online' : 'Simulator Offline')
              : online       ? 'ESP32 Online'
              :                'ESP32 Offline';

  const color = !data  ? 'bg-gray-400'
              : online ? (isSim ? 'bg-blue-500' : 'bg-green-500')
              :           'bg-red-500';

  const tooltip = online && data?.ip
    ? `${isSim ? 'Wokwi Simulator' : 'Device'}  IP: ${data.ip}  RSSI: ${data.rssi} dBm`
    : undefined;

  return (
    <span
      className="flex items-center gap-1 text-xs font-normal text-muted-foreground"
      title={tooltip}
    >
      <span className={`inline-block h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}
