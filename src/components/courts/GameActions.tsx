'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { endGame, requeueGame } from '@/features/courts/actions';

interface Props {
  gameId: string;
  courtId: string;
  courtName: string;
}

export function GameActions({ gameId, courtId, courtName }: Props) {
  const router = useRouter();
  const [showRequeue, setShowRequeue] = useState(false);
  const [position, setPosition] = useState(0);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const handle = async (action: string, fn: () => Promise<void>) => {
    setLoading(action);
    setMessage(null);
    try {
      await fn();
      if (action === 'requeue') {
        setMessage('Requeued ✓');
        setShowRequeue(false);
      } else {
        setMessage(action === 'end' ? 'Ended ✓' : 'Refunded ✓');
      }
      router.refresh();
    } catch (err: any) {
      alert(err.message);
    }
    setLoading(null);
  };

  return (
    <div className="space-y-2 mt-3 pt-3 border-t border-zinc-700">
      <p className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Admin Actions</p>

      {message ? (
        <p className="text-sm text-emerald-400 font-semibold">{message}</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={loading !== null}
            onClick={() => handle('end', () => endGame(gameId, courtId, false))}
          >
            {loading === 'end' ? '...' : 'End Game'}
          </Button>
          <Button size="sm" variant="outline" disabled={loading !== null}
            onClick={() => {
              if (confirm(`End game on ${courtName} and refund?`)) {
                handle('refund', () => endGame(gameId, courtId, true));
              }
            }}
          >
            {loading === 'refund' ? '...' : 'End + Refund'}
          </Button>
          <Button size="sm" variant="outline" disabled={loading !== null}
            onClick={() => setShowRequeue(!showRequeue)}
          >
            Requeue
          </Button>
        </div>
      )}

      {showRequeue && !message && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-400">Position:</span>
          <Input type="number" min={0} max={99} value={position} onChange={e => setPosition(parseInt(e.target.value) || 0)}
            className="w-16 h-8 text-sm" />
          <Button size="sm" disabled={loading !== null}
            onClick={() => handle('requeue', () => requeueGame(gameId, courtId, position))}
          >
            {loading === 'requeue' ? '...' : 'Insert'}
          </Button>
        </div>
      )}
    </div>
  );
}
