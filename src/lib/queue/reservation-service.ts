import { createClient } from '@/lib/supabase/server';
import { isSlotAvailable } from './booking-engine';
import { processCourt } from './queue-processor';
import { publishDisplay } from '@/lib/mqtt';

export async function acceptOffer(entryId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();

  const { data: entry } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('id', entryId)
    .single();
  if (!entry) return { success: false, error: 'Queue entry not found' };
  if (entry.status !== 'offered') return { success: false, error: 'Offer already processed' };
  if (new Date(entry.expires_at) < new Date()) {
    await expireOffer(entryId, entry.court_id);
    return { success: false, error: 'Offer expired' };
  }

  const { data: member } = await supabase
    .from('members')
    .select('status')
    .eq('id', entry.member_id)
    .single();
  if (!member || member.status !== 'Active') {
    await supabase.from('queue_entries').update({ status: 'insufficient_credits', updated_at: new Date().toISOString() }).eq('id', entryId);
    if (entry.court_id) await processCourt(entry.court_id);
    return { success: false, error: 'Member not active' };
  }

  const start = new Date(entry.requested_start);
  const end = new Date(start.getTime() + entry.duration * 60_000);
  if (!entry.court_id || !(await isSlotAvailable(entry.court_id, start, end))) {
    await supabase.from('queue_entries').update({ status: 'waiting', court_id: null, expires_at: null, updated_at: new Date().toISOString() }).eq('id', entryId);
    if (entry.court_id) await processCourt(entry.court_id);
    return { success: false, error: 'Court no longer available' };
  }

  const { data: court } = await supabase.from('courts').select('name').eq('id', entry.court_id).single();
  const { data: rfidCards } = await supabase
    .from('rfid_cards')
    .select('uid, member_id')
    .in('member_id', entry.player_ids)
    .eq('status', 'Active');

  const rfidMap = new Map((rfidCards ?? []).map(r => [r.member_id, r.uid]));
  const players = (entry.player_ids as string[]).map((pid, i) => ({
    rfid: rfidMap.get(pid) || '',
    team: entry.party_size === 4 ? (i < 2 ? 'Team A' : 'Team B') : null,
    charge_amount: 0,
  }));

  const { error: gameErr } = await supabase.rpc('register_game', {
    p_court_name: court?.name ?? '',
    p_match_type: entry.party_size === 4 ? '2v2' : '1v1',
    p_duration: entry.duration,
    p_players: JSON.stringify(players),
  });

  if (gameErr) {
    if (gameErr.message?.toLowerCase().includes('insufficient')) {
      await supabase.from('queue_entries').update({ status: 'insufficient_credits', updated_at: new Date().toISOString() }).eq('id', entryId);
      if (entry.court_id) await processCourt(entry.court_id);
      return { success: false, error: 'Insufficient credits' };
    }
    return { success: false, error: gameErr.message };
  }

  await supabase.from('queue_entries').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('id', entryId);

  await publishDisplay(entry.court_id, {
    line1: court?.name?.toUpperCase() ?? 'COURT',
    line2: 'GAME STARTED',
    line3: 'RUNNING',
  });

  return { success: true };
}

export async function declineOffer(entryId: string, courtId: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase.from('queue_entries').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', entryId);
  if (courtId) await processCourt(courtId);
}

export async function expireOffer(entryId: string, courtId: string | null): Promise<void> {
  const supabase = await createClient();
  await supabase.from('queue_entries').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', entryId);
  if (courtId) await processCourt(courtId);
}
