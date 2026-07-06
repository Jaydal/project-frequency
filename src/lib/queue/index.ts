export type QueueStatus =
  | 'waiting' | 'offered' | 'accepted'
  | 'declined' | 'expired' | 'cancelled'
  | 'completed' | 'insufficient_credits';

export interface CourtInfo {
  id: string;
  name: string;
  status: string;
}

export interface QueueEntry {
  id: string;
  member_id: string;
  requested_start: string;
  duration: number;
  party_size: number;
  player_ids: string[];
  court_id: string | null;
  status: QueueStatus;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export const QUEUE_DEFAULT_TIMEOUT_MIN = 5;
export const AVG_GAME_DURATION_MIN = 60;

export function isOverlapping(
  requestedStart: Date, requestedEnd: Date,
  existingStart: Date, existingEnd: Date
): boolean {
  return requestedStart < existingEnd && requestedEnd > existingStart;
}
