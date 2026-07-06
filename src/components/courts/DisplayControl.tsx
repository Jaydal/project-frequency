'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

type Court = { id: string; name: string };
type Lines = [string, string, string];
type Status = 'idle' | 'loading' | 'ok' | 'error';

const PRESETS: { label: string; lines: Lines }[] = [
  { label: 'Welcome',      lines: ['WELCOME',       'HAVE FUN!',    ''] },
  { label: 'Court Open',   lines: ['COURT OPEN',    '',             ''] },
  { label: 'Court Closed', lines: ['COURT CLOSED',  'SEE YOU NEXT', 'TIME!'] },
  { label: 'Break',        lines: ['SHORT BREAK',   '5 MINUTES',    ''] },
  { label: 'Tournament',   lines: ['TOURNAMENT',    'IN PROGRESS',  ''] },
  { label: 'Clear',        lines: ['',              '',             ''] },
];

export default function DisplayControl({ courts }: { courts: Court[] }) {
  const [courtId, setCourtId]   = useState<string>(courts[0]?.id ?? '');
  const [draft, setDraft]       = useState<Lines>(['', '', '']);
  const [status, setStatus]     = useState<Status>('idle');

  const courtName = courts.find(c => c.id === courtId)?.name ?? '';

  async function publish(lines: Lines) {
    if (!courtId) return;
    setDraft(lines);
    setStatus('loading');
    try {
      const res = await fetch('/api/display/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courtId, line1: lines[0], line2: lines[1], line3: lines[2] }),
      });
      setStatus(res.ok ? 'ok' : 'error');
    } catch {
      setStatus('error');
    }
    setTimeout(() => setStatus('idle'), 2000);
  }

  const btnLabel =
    status === 'loading' ? 'Sending…' :
    status === 'ok'      ? 'Sent ✓' :
    status === 'error'   ? 'Failed ✗' :
    `Send to ${courtName || 'Court'}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          Manual Display
          <Badge variant="outline">MQTT</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Court selector */}
        <div>
          <Label className="text-xs text-muted-foreground">Target Court</Label>
          <Select value={courtId} onValueChange={(v) => v && setCourtId(v)}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select a court" />
            </SelectTrigger>
            <SelectContent>
              {courts.map(c => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Quick presets */}
        <div>
          <Label className="text-xs text-muted-foreground">Quick Presets</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {PRESETS.map(p => (
              <Button
                key={p.label}
                size="sm"
                variant="outline"
                disabled={!courtId || status === 'loading'}
                onClick={() => publish(p.lines)}
              >
                {p.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Preview */}
        <div className="rounded bg-black p-3 font-mono text-sm text-white space-y-1">
          {draft.map((l, i) => (
            <div key={i} className="truncate">
              {l || <span className="text-gray-600">—</span>}
            </div>
          ))}
        </div>

        {/* Custom 3-line edit */}
        <div className="space-y-2">
          {(['Line 1 (top)', 'Line 2 (middle)', 'Line 3 (bottom)'] as const).map((label, i) => (
            <div key={i}>
              <Label className="text-xs text-muted-foreground">{label}</Label>
              <Input
                value={draft[i]}
                maxLength={20}
                className="mt-0.5"
                onChange={e => {
                  const next = [...draft] as Lines;
                  next[i] = e.target.value.toUpperCase();
                  setDraft(next);
                }}
              />
            </div>
          ))}
        </div>

        <Button
          className="w-full"
          disabled={!courtId || status === 'loading'}
          onClick={() => publish(draft)}
        >
          {btnLabel}
        </Button>
      </CardContent>
    </Card>
  );
}
