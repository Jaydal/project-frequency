'use client';

import type { RefObject } from 'react';

interface Props {
  rfidRef: RefObject<HTMLInputElement | null>;
  onRfidSubmit: (e: React.FormEvent) => void;
}

export function IdleScreen({ rfidRef, onRfidSubmit }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6">
      <div className="text-7xl mb-4">🏓</div>
      <h1 className="text-3xl font-bold text-gray-800 mb-2">Pickleball Courts</h1>
      <p className="text-lg text-gray-500 mb-8">Tap your RFID card to start</p>

      <form onSubmit={onRfidSubmit} className="w-full max-w-sm text-center">
        <input ref={rfidRef} type="text" autoFocus
          className="w-full h-16 text-center text-xl border-2 border-gray-300 rounded-2xl outline-none focus:border-blue-500 bg-gray-50"
          placeholder="Tap RFID card here..."
        />
        <button type="submit" hidden />
      </form>
    </div>
  );
}
