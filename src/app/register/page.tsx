'use client';

import { useState } from 'react';
import { registerMember } from '@/features/registration/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

declare global {
  interface NDEFReader {
    scan(options?: { signal?: AbortSignal }): Promise<void>;
    addEventListener(
      type: 'reading',
      listener: (e: NDEFReadingEvent) => void,
      options?: { once?: boolean },
    ): void;
    removeEventListener(type: 'reading', listener: (e: NDEFReadingEvent) => void): void;
  }

  interface NDEFReadingEvent extends Event {
    serialNumber: string;
    message: NDEFMessage;
  }

  interface NDEFMessage {
    records: NDEFRecord[];
  }

  interface NDEFRecord {
    recordType: string;
    mediaType?: string;
    data?: DataView;
  }

  var NDEFReader: new () => NDEFReader;
}
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function RegisterPage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [rfidUid, setRfidUid] = useState('');
  const [initialCredits, setInitialCredits] = useState('');
  const [scanning, setScanning] = useState(false);
  const [nfcError, setNfcError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ memberId: string } | null>(null);
  const [error, setError] = useState('');

  async function handleScanNfc() {
    if (!('NDEFReader' in window)) {
      setNfcError('Web NFC not available on this device/browser. Enter UID manually.');
      return;
    }

    setScanning(true);
    setNfcError('');

    try {
      const abort = new AbortController();
      const reader = new NDEFReader();
      await reader.scan({ signal: abort.signal });

      await new Promise<void>((resolve, reject) => {
        reader.addEventListener(
          'reading',
          (e: NDEFReadingEvent) => {
            if (e.serialNumber) {
              setRfidUid(e.serialNumber);
            }
            abort.abort();
            resolve();
          },
          { once: true },
        );

        setTimeout(() => {
          abort.abort();
          reject(new Error('NFC scan timed out'));
        }, 30000);
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setNfcError(err.message || 'Failed to read NFC tag');
      }
    } finally {
      setScanning(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const res = await registerMember({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim() || undefined,
        rfidUid: rfidUid.trim() || undefined,
        initialCredits: initialCredits ? Number(initialCredits) : undefined,
      });
      setResult(res);
      setFirstName('');
      setLastName('');
      setEmail('');
      setRfidUid('');
      setInitialCredits('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Registration Complete</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-green-600 font-medium">Member registered successfully!</p>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>Member ID: <span className="font-mono">{result.memberId}</span></p>
              {rfidUid && <p>RFID: <span className="font-mono">{rfidUid}</span></p>}
            </div>
            <Button onClick={() => setResult(null)} className="w-full">
              Register Another
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Member Registration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  required
                  placeholder="Juan"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  required
                  placeholder="Dela Cruz"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="juan@example.com"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rfid">RFID / NFC Tag UID</Label>
              <div className="flex gap-2">
                <Input
                  id="rfid"
                  value={rfidUid}
                  onChange={(e) => setRfidUid(e.target.value)}
                  placeholder="Tap Scan or enter manually"
                  className="font-mono"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleScanNfc}
                  disabled={scanning}
                  className="shrink-0"
                >
                  {scanning ? 'Scanning…' : 'Scan NFC'}
                </Button>
              </div>
              {nfcError && <p className="text-xs text-destructive">{nfcError}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="credits">Initial Credits (optional)</Label>
              <Input
                id="credits"
                type="number"
                min="0"
                value={initialCredits}
                onChange={(e) => setInitialCredits(e.target.value)}
                placeholder="e.g. 100"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button type="submit" disabled={submitting} className="w-full">
              {submitting ? 'Registering…' : 'Register Member'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
