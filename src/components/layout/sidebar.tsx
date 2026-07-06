import Link from 'next/link';
import { Home, Users, CreditCard, Settings, Activity, HeartPulse } from 'lucide-react';

export function Sidebar() {
  return (
    <div className="w-64 bg-gray-900 text-white min-h-screen p-4 flex flex-col">
      <div className="text-2xl font-bold mb-8 text-green-400">Pickleball Admin</div>
      <nav className="flex-1 space-y-2">
        <Link href="/" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <Home size={20} /> Dashboard
        </Link>
        <Link href="/members" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <Users size={20} /> Members
        </Link>
        <Link href="/wallet" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <CreditCard size={20} /> Wallet & Payments
        </Link>
        <Link href="/courts" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <Activity size={20} /> Court Monitor
        </Link>
        <Link href="/rfid" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <CreditCard size={20} /> RFID Cards
        </Link>
        <Link href="/settings" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <Settings size={20} /> Settings
        </Link>
        <Link href="/reports" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <Activity size={20} /> Reports
        </Link>
        <Link href="/health" className="flex items-center gap-2 p-2 hover:bg-gray-800 rounded">
          <HeartPulse size={20} /> Health
        </Link>
      </nav>
    </div>
  );
}
