export const MINIMUM_DURATION_MINUTES = 30;
export const MAXIMUM_TAKEOVER_BUFFER = 45;
export const GRACE_PERIOD_MINUTES = 15;
export const EARLY_CHECKIN_MINUTES = 30;

export type MemberStatus = 'Active' | 'Suspended' | 'Inactive';

export interface PolicyMember {
  id: string;
  status: MemberStatus;
}

export interface PolicyGame {
  id: string;
  courtId: string;
  status: 'Scheduled' | 'In Progress' | 'Completed';
  startTime: Date;
  duration: number; // minutes
  playerIds: string[];
}

export interface PolicyQueueEntry {
  id: string;
  memberId: string;
  status: 'waiting' | 'offered';
}

export interface PolicyGuestRequest {
  id: string;
  referenceCode: string;
  courtId: string;
  status: 'Pending Confirmation' | 'Confirmed' | 'Rejected' | 'Expired';
  paymentStatus: 'Pending' | 'Confirmed' | 'Not Required';
  startTime: Date;
  duration: number;
}

export type RfidDecision =
  | { type: 'check-in scheduled'; gameId: string; courtId: string; courtName?: string; startTime: Date; duration: number }
  | { type: 'play now'; courtId: string; courtName?: string; duration: number; capped: boolean; cutoffTime?: Date }
  | { type: 'already active'; courtId: string; gameId: string }
  | { type: 'already queued'; entryId: string }
  | { type: 'no eligible window'; reason: string; courtId?: string; courtName?: string; nextReservationStart?: Date }
  | { type: 'member unavailable'; reason: string };

export type GuestReferenceDecision =
  | { type: 'guest check-in confirmed'; requestId: string; courtId: string; startTime: Date; duration: number }
  | { type: 'guest payment pending'; requestId: string }
  | { type: 'invalid reference'; reason: string };

export interface EvaluateRfidScanOptions {
  minDuration?: number;
  allowedDurations?: number[];
}

/**
 * Evaluates what should happen when a member taps their RFID card at the kiosk.
 */
export function evaluateRfidScan(
  member: PolicyMember,
  now: Date,
  requestedDuration: number,
  memberGames: PolicyGame[],
  memberQueueEntries: PolicyQueueEntry[],
  bestOption?: { courtId: string, courtName?: string, cutoff: Date | null },
  options?: EvaluateRfidScanOptions
): RfidDecision {
  if (member.status !== 'Active') {
    return { type: 'member unavailable', reason: `Member status is ${member.status}` };
  }

  const activeGame = memberGames.find(g => {
    if (g.status !== 'In Progress') return false;
    const startMs = g.startTime.getTime();
    const endMs = startMs + g.duration * 60_000;
    return now.getTime() < endMs;
  });
  if (activeGame) {
    return { type: 'already active', courtId: activeGame.courtId, gameId: activeGame.id };
  }

  const activeQueue = memberQueueEntries.find(q => q.status === 'waiting' || q.status === 'offered');
  if (activeQueue) {
    return { type: 'already queued', entryId: activeQueue.id };
  }

  // Check-in logic: Find a scheduled game within the valid window
  const graceMs = GRACE_PERIOD_MINUTES * 60 * 1000;
  const earlyCheckInMs = EARLY_CHECKIN_MINUTES * 60 * 1000; // Allow check-in 30 mins early
  const scheduledGame = memberGames
    .filter(g => g.status === 'Scheduled')
    .find(g => {
      const startMs = g.startTime.getTime();
      const nowMs = now.getTime();
      return nowMs >= startMs - earlyCheckInMs && nowMs <= startMs + graceMs;
    });

  if (scheduledGame) {
    return {
      type: 'check-in scheduled',
      gameId: scheduledGame.id,
      courtId: scheduledGame.courtId,
      startTime: scheduledGame.startTime,
      duration: scheduledGame.duration
    };
  }

  // "Play Now" takeover logic
  if (!bestOption) {
    // No courts available immediately. The member will join the waitlist.
    return { type: 'play now', courtId: 'any', duration: requestedDuration, capped: false };
  }

  if (bestOption.cutoff) {
    // Add 30 seconds tolerance so e.g. 14m45s rounds up to 15 mins
    const availableMinutes = Math.floor(((bestOption.cutoff.getTime() - now.getTime()) + 30_000) / (60 * 1000));
    
    let cappedDuration = 0;
    const minDur = options?.minDuration ?? MINIMUM_DURATION_MINUTES;

    if (options?.allowedDurations && options.allowedDurations.length > 0) {
      // Find the largest configured duration that fits both within availableMinutes and requestedDuration
      const sorted = [...options.allowedDurations].sort((a, b) => b - a);
      const fitting = sorted.find(d => d <= availableMinutes && d <= requestedDuration);
      cappedDuration = fitting ?? 0;
    } else {
      const step = minDur;
      cappedDuration = Math.floor(availableMinutes / step) * step;
    }
    
    if (cappedDuration < minDur) {
      return { 
        type: 'no eligible window', 
        reason: 'Court is reserved soon',
        courtId: bestOption.courtId,
        courtName: bestOption.courtName,
        nextReservationStart: bestOption.cutoff 
      };
    }

    if (cappedDuration < requestedDuration) {
      return {
        type: 'play now',
        courtId: bestOption.courtId,
        courtName: bestOption.courtName,
        duration: cappedDuration,
        capped: true,
        cutoffTime: bestOption.cutoff
      };
    }
  }

  return { type: 'play now', courtId: bestOption.courtId, courtName: bestOption.courtName, duration: requestedDuration, capped: false };
}

/**
 * Evaluates a guest reference code entered at the kiosk.
 */
export function evaluateGuestReference(
  request: PolicyGuestRequest | null,
  now: Date
): GuestReferenceDecision {
  if (!request) {
    return { type: 'invalid reference', reason: 'Reference code not found' };
  }

  if (request.status === 'Expired' || request.status === 'Rejected') {
    return { type: 'invalid reference', reason: `Request is ${request.status.toLowerCase()}` };
  }

  if (request.status === 'Pending Confirmation') {
    // Could still be awaiting payment
    if (request.paymentStatus === 'Pending') {
      return { type: 'guest payment pending', requestId: request.id };
    }
    // If not pending payment but still pending confirmation, admin hasn't approved it yet
    return { type: 'invalid reference', reason: 'Booking is awaiting admin approval' };
  }

  if (request.status === 'Confirmed') {
    const startMs = request.startTime.getTime();
    const nowMs = now.getTime();
    const graceMs = GRACE_PERIOD_MINUTES * 60 * 1000;
    const earlyCheckInMs = 30 * 60 * 1000;

    if (nowMs > startMs + graceMs) {
      return { type: 'invalid reference', reason: 'Check-in grace period has expired (no-show)' };
    }
    if (nowMs < startMs - earlyCheckInMs) {
      return { type: 'invalid reference', reason: 'Too early to check in' };
    }

    if (request.paymentStatus === 'Pending') {
      return { type: 'guest payment pending', requestId: request.id };
    }

    return {
      type: 'guest check-in confirmed',
      requestId: request.id,
      courtId: request.courtId,
      startTime: request.startTime,
      duration: request.duration
    };
  }

  return { type: 'invalid reference', reason: 'Invalid booking state' };
}
