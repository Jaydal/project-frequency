'use client';

import type { RefObject } from 'react';

interface Player {
  id: string;
  memberId: string;
  firstName: string;
  lastName: string;
  balance: number;
}

interface Props {
  testMode: boolean;
  testPlayers: Player[];
  rfidRef: RefObject<HTMLInputElement | null>;
  onRfidSubmit: (e: React.FormEvent) => void;
  onTestPlayer: (p: Player) => void;
}

export function IdleScreen({ testMode, testPlayers, rfidRef, onRfidSubmit, onTestPlayer }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-7xl mb-4">🏓</div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Pickleball Courts</h1>
      <p className="text-lg text-gray-500 mb-8">Tap your RFID card to start</p>

      {testMode ? (
        <div className="grid grid-cols-3 gap-3 w-full max-w-md">
          {testPlayers.map(p => (
            <button key={p.memberId} onClick={() => onTestPlayer(p)}
              className="bg-white border-2 border-gray-200 rounded-2xl p-5 text-center active:border-blue-500 cursor-pointer"
            >
              <div className="text-lg font-bold">{p.firstName}</div>
              <div className="text-xs text-gray-500">{p.lastName}</div>
              <div className="text-sm font-semibold mt-1 text-green-700">₱{p.balance.toLocaleString()}</div>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={onRfidSubmit} className="w-full max-w-sm text-center">
          <input ref={rfidRef} type="text" autoFocus
            className="w-full h-16 text-center text-xl border-2 border-gray-300 rounded-2xl outline-none focus:border-blue-500 bg-gray-50"
            placeholder="Tap RFID card here..."
          />
          <button type="submit" hidden />
        </form>
      )}
    </div>
  );
}
