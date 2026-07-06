'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';

type QueueEntry = {
  id: string;
  member_id: string;
  requested_start: string;
  duration: number;
  party_size: number;
  status: string;
  court_id: string | null;
  expires_at: string | null;
  created_at: string;
};

type Props = {
  courts: { id: string; name: string }[];
};

const STATUS_COLORS: Record<string, string> = {
  waiting: 'bg-yellow-100 text-yellow-800',
  offered: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  expired: 'bg-gray-100 text-gray-500',
  declined: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-gray-100 text-gray-500',
  insufficient_credits: 'bg-orange-100 text-orange-800',
};

export default function QueuePanel({ courts }: Props) {
  const [entries, setEntries] = useState<QueueEntry[]>([]);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [busy, setBusy] = useState<string | null>(null);

  async function fetchQueue() {
    const supabase = createClient();
    const { data } = await supabase
      .from('queue_entries')
      .select('*')
      .order('created_at', { ascending: true });
    if (data) setEntries(data);
  }

  useEffect(() => {
    fetchQueue();
    const id = setInterval(fetchQueue, 5000);
    return () => clearInterval(id);
  }, []);

  const visible = entries.filter(e => {
    if (filterStatus !== 'all' && e.status !== filterStatus) return false;
    if (filterCourt !== 'all' && e.court_id !== filterCourt) return false;
    return true;
  });

  async function extendOffer(id: string) {
    setBusy(id);
    const supabase = createClient();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    await supabase.from('queue_entries').update({ expires_at: expiresAt }).eq('id', id);
    await fetchQueue();
    setBusy(null);
  }

  async function remove(id: string) {
    setBusy(id);
    const supabase = createClient();
    await supabase.from('queue_entries').update({ status: 'cancelled' }).eq('id', id);
    await fetchQueue();
    setBusy(null);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          Queue
          <div className="flex items-center gap-2">
            <Badge variant="outline">{entries.filter(e => e.status === 'waiting').length} waiting</Badge>
            <Select value={filterStatus} onValueChange={v => v && setFilterStatus(v)}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="waiting">Waiting</SelectItem>
                <SelectItem value="offered">Offered</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCourt} onValueChange={v => v && setFilterCourt(v)}>
              <SelectTrigger className="h-7 text-xs w-32"><SelectValue placeholder="Court" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All courts</SelectItem>
                {courts.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No entries</p>
        ) : (
          <div className="space-y-2">
            {visible.map(entry => (
              <div key={entry.id} className="rounded border p-3 text-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-medium truncate">
                      #{entry.id.slice(0, 8)} · {entry.duration} min · {entry.party_size === 4 ? '2v2' : '1v1'}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={STATUS_COLORS[entry.status] ?? ''}>{entry.status}</Badge>
                      {entry.expires_at && (
                        <span className="text-xs text-muted-foreground">
                          Expires: {new Date(entry.expires_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {entry.status === 'offered' && (
                    <Button size="sm" disabled={busy === entry.id} onClick={() => extendOffer(entry.id)}>
                      Extend
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy === entry.id} onClick={() => remove(entry.id)}>
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
