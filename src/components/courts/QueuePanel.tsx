'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { createClient } from '@/lib/supabase/client';
import { reorderQueue } from '@/features/courts/actions';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

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

function SortableItem({
  entry,
  busy,
  onExtend,
  onRemove,
}: {
  entry: QueueEntry;
  busy: string | null;
  onExtend: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: entry.status !== 'waiting',
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="rounded border p-3 text-sm space-y-2 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {entry.status === 'waiting' && (
            <button
              className="cursor-grab active:cursor-grabbing touch-none text-muted-foreground hover:text-foreground shrink-0"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
            </button>
          )}
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
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {entry.status === 'offered' && (
          <Button size="sm" disabled={busy === entry.id} onClick={() => onExtend(entry.id)}>
            Extend
          </Button>
        )}
        <Button size="sm" variant="outline" disabled={busy === entry.id} onClick={() => onRemove(entry.id)}>
          Remove
        </Button>
      </div>
    </div>
  );
}

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const sortedWaiting = entries.filter(e => e.status === 'waiting').sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const oldIndex = sortedWaiting.findIndex(e => e.id === active.id);
    const newIndex = sortedWaiting.findIndex(e => e.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // Optimistically reorder entries in local state
    setEntries(prev => {
      const reordered = [...prev];
      const dndIds = sortedWaiting.map(e => e.id);
      dndIds.splice(oldIndex, 1);
      dndIds.splice(newIndex, 0, active.id as string);
      const orderMap = new Map(dndIds.map((id, i) => [id, i]));
      return reordered.sort((a, b) => {
        const ai = orderMap.get(a.id);
        const bi = orderMap.get(b.id);
        if (ai !== undefined && bi !== undefined) return ai - bi;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    });

    await reorderQueue(active.id as string, newIndex).catch(console.error);
  }

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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={visible.map(e => e.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visible.map(entry => (
                  <SortableItem
                    key={entry.id}
                    entry={entry}
                    busy={busy}
                    onExtend={extendOffer}
                    onRemove={remove}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}
