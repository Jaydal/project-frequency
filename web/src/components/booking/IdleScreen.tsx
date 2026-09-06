'use client';

import { type RefObject, useEffect, useState } from 'react';

interface Props {
  rfidRef: RefObject<HTMLInputElement | null>;
  onRfidSubmit: (e: React.FormEvent) => void;
  onGuestBooking: () => void;
}

export function IdleScreen({ rfidRef, onRfidSubmit, onGuestBooking }: Props) {
  const [nfcSupported, setNfcSupported] = useState(false);
  const [nfcStatus, setNfcStatus] = useState<'idle' | 'scanning' | 'error'>('idle');

  useEffect(() => {
    // Check if Web NFC is supported
    if ('NDEFReader' in window) {
      setNfcSupported(true);
      
      const scanNFC = async () => {
        try {
          setNfcStatus('scanning');
          // @ts-ignore - NDEFReader is not in standard TS DOM types yet
          const ndef = new NDEFReader();
          await ndef.scan();
          
          (ndef as any).onreading = (event: any) => {
            // Get the serial number from the NFC tag (UID)
            const serialNumber = event.serialNumber;
            if (serialNumber && rfidRef.current) {
              // Format standard: convert standard hex serial to our system's format if needed.
              // By default, Web NFC returns serial in format "01:23:45:67:89:ab:cd"
              // Our system uses raw hex or whatever format the physical reader sends.
              // Let's strip colons to match typical raw hex, and uppercase it.
              const cleanUid = serialNumber.replace(/:/g, '').toUpperCase();
              rfidRef.current.value = cleanUid;
              
              // Trigger the form submit manually
              if (rfidRef.current.form) {
                rfidRef.current.form.dispatchEvent(
                  new Event('submit', { cancelable: true, bubbles: true })
                );
              }
            }
          };
          
          (ndef as any).onreadingerror = () => {
            setNfcStatus('error');
            setTimeout(() => setNfcStatus('scanning'), 3000);
          };
        } catch (error) {
          console.error("NFC Scan Error:", error);
          setNfcStatus('error');
        }
      };
      
      scanNFC();
    }
  }, [rfidRef]);

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6">
      <div className={`size-16 rounded-full border-2 flex items-center justify-center transition-colors ${nfcStatus === 'scanning' ? 'border-[#32A45E] animate-pulse shadow-[0_0_15px_rgba(50,164,94,0.5)]' : nfcStatus === 'error' ? 'border-red-500' : 'border-primary-foreground/20'}`}>
        <svg className={`size-8 ${nfcStatus === 'scanning' ? 'text-[#32A45E]' : nfcStatus === 'error' ? 'text-red-500' : 'text-primary-foreground/80'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-semibold text-primary-foreground mb-1">Court Terminal</h1>
        <p className="text-sm text-primary-foreground/80">
          {nfcSupported 
            ? (nfcStatus === 'scanning' ? 'Tap phone or card to book' : nfcStatus === 'error' ? 'NFC Error. Try again.' : 'Tap RFID card to book') 
            : 'Enter RFID to book'}
        </p>
      </div>

      <form onSubmit={onRfidSubmit} className="w-full max-w-xs">
        <input ref={rfidRef} type="text" autoFocus
          className="w-full h-12 text-center text-lg bg-primary-foreground/10 border border-primary-foreground/20 rounded-lg text-primary-foreground placeholder-primary-foreground/50 focus:outline-none focus:border-primary-foreground/30 focus:ring-1 focus:ring-primary-foreground/30"
          placeholder="RFID card number"
        />
        <button type="submit" hidden />
      </form>
      <div className="flex items-center gap-3 text-[10px] text-zinc-600 uppercase tracking-widest">
        <span className="h-px w-8 bg-[#31453a]" />
        <span>or</span>
        <span className="h-px w-8 bg-[#31453a]" />
      </div>
      <button
        type="button"
        onClick={onGuestBooking}
        className="w-full max-w-xs rounded-xl border border-[#536a5c] bg-[#1b2a23] px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-[#d9e3dc] hover:border-[#32A45E]/70 hover:bg-[#24372e] hover:text-[#FCFCF6] transition-colors"
      >
        Book as Guest
      </button>
    </div>
  );
}
