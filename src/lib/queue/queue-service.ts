import { createClient } from '@/lib/supabase/server';
import type { QueueEntry } from './index';
import { AVG_GAME_DURATION_MIN } from './index';

export interface JoinQueueParams {
  memberId: string;
  start: Date;
  duration: number;
  partySize: number;
  playerIds: string[];
  courtId?: string;
}

export async function joinQueue(params: JoinQueueParams): Promise<QueueEntry> {
  const supabase = await createClient();

  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('id', params.memberId)
    .single();
  if (!member || member.status !== 'Active') throw new Error('Member not active');

  // Check if member already has an active booking
  const { data: activeGames } = await supabase
    .from('games')
    .select('id')
    .in('status', ['Scheduled', 'In Progress']);

  if (activeGames && activeGames.length > 0) {
    const { data: myBookings } = await supabase
      .from('game_players')
      .select('id')
      .eq('member_id', params.memberId)
      .in('game_id', activeGames.map(g => g.id));

    if (myBookings && myBookings.length > 0) {
      throw new Error('Already booked');
    }
  }

  // Check for existing waiting queue entry
  const { data: existingQueue } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('member_id', params.memberId)
    .eq('status', 'waiting')
    .single();
  if (existingQueue) throw new Error('Already in queue');

  // Join the queue (immediate booking not supported — always queue, processor handles game creation)
  const insertData: Record<string, any> = {
    member_id: params.memberId,
    requested_start: params.start.toISOString(),
    duration: params.duration,
    party_size: params.partySize,
    player_ids: JSON.stringify(params.playerIds),
    status: 'waiting',
  };
  if (params.courtId) insertData.court_id = params.courtId;

  const { data: entry, error } = await supabase
    .from('queue_entries')
    .insert(insertData)
    .select()
    .single();
  if (error) throw new Error(error.message);

  return entry as QueueEntry;
}

export async function leaveQueue(entryId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('queue_entries')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', entryId);
}

export async function getQueuePosition(entryId: string): Promise<number> {
  const supabase = await createClient();
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('created_at')
    .eq('id', entryId)
    .single();
  if (!entry) return 0;
  const { count } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'waiting')
    .lt('created_at', entry.created_at);
  return count ?? 0;
}

export function getEstimatedWait(position: number): string {
  if (position <= 0) return 'Now';
  const minutes = position * AVG_GAME_DURATION_MIN;
  if (minutes <= 60) return `~${minutes} min`;
  return `~${Math.ceil(minutes / 60)} hours`;
}
