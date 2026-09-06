import { describe, it, expect } from 'vitest';
import { 
  evaluateRfidScan, 
  evaluateGuestReference,
  PolicyMember,
  PolicyGame,
  PolicyQueueEntry,
  PolicyGuestRequest
} from './reservation-policy';

describe('Reservation Policy', () => {
  describe('evaluateRfidScan', () => {
    const activeMember: PolicyMember = { id: 'm1', status: 'Active' };
    const inactiveMember: PolicyMember = { id: 'm2', status: 'Suspended' };
    const now = new Date('2026-08-30T10:00:00Z');

    it('denies inactive members', () => {
      const result = evaluateRfidScan(inactiveMember, now, 60, [], []);
      expect(result.type).toBe('member unavailable');
    });

    it('denies members currently playing', () => {
      const games: PolicyGame[] = [{
        id: 'g1', courtId: 'c1', status: 'In Progress', startTime: new Date('2026-08-30T09:30:00Z'), duration: 60, playerIds: ['m1']
      }];
      const result = evaluateRfidScan(activeMember, now, 60, games, []);
      expect(result).toEqual({ type: 'already active', courtId: 'c1', gameId: 'g1' });
    });

    it('does not deny members whose In Progress game has already ended in time', () => {
      const pastGames: PolicyGame[] = [{
        id: 'g1', courtId: 'c1', status: 'In Progress', startTime: new Date('2026-08-30T08:00:00Z'), duration: 60, playerIds: ['m1']
      }];
      const result = evaluateRfidScan(activeMember, now, 60, pastGames, [], { courtId: 'c1', cutoff: null });
      expect(result.type).toBe('play now');
    });

    it('denies members already in queue', () => {
      const queue: PolicyQueueEntry[] = [{ id: 'q1', memberId: 'm1', status: 'waiting' }];
      const result = evaluateRfidScan(activeMember, now, 60, [], queue);
      expect(result).toEqual({ type: 'already queued', entryId: 'q1' });
    });

    it('allows check-in for a scheduled game within the time window', () => {
      const games: PolicyGame[] = [{
        id: 'g1', courtId: 'c1', status: 'Scheduled', startTime: new Date('2026-08-30T10:05:00Z'), duration: 60, playerIds: ['m1']
      }];
      const result = evaluateRfidScan(activeMember, now, 60, games, []);
      expect(result).toEqual({ type: 'check-in scheduled', gameId: 'g1', courtId: 'c1', startTime: games[0].startTime, duration: 60 });
    });

    it('falls back to play-now logic if scheduled game is too far in future', () => {
      const games: PolicyGame[] = [{
        id: 'g1', courtId: 'c1', status: 'Scheduled', startTime: new Date('2026-08-30T14:00:00Z'), duration: 60, playerIds: ['m1']
      }];
      const result = evaluateRfidScan(activeMember, now, 60, games, [], { courtId: 'c1', cutoff: null });
      expect(result).toEqual({ type: 'play now', courtId: 'c1', duration: 60, capped: false });
    });

    it('allows play now without cutoff if no upcoming reservations', () => {
      const result = evaluateRfidScan(activeMember, now, 60, [], [], { courtId: 'c1', cutoff: null });
      expect(result).toEqual({ type: 'play now', courtId: 'c1', duration: 60, capped: false });
    });

    it('caps play now duration if upcoming reservation intersects (snaps to nearest 30 mins)', () => {
      const nextRes = new Date('2026-08-30T10:40:00Z'); // 40 mins away
      const result = evaluateRfidScan(activeMember, now, 60, [], [], { courtId: 'c1', courtName: 'Court 1', cutoff: nextRes });
      expect(result).toEqual({ type: 'play now', courtId: 'c1', courtName: 'Court 1', duration: 30, capped: true, cutoffTime: nextRes });
    });

    it('denies play now if upcoming reservation is too close (< 30 mins)', () => {
      const nextRes = new Date('2026-08-30T10:20:00Z'); // 20 mins away
      const result = evaluateRfidScan(activeMember, now, 60, [], [], { courtId: 'c1', cutoff: nextRes });
      expect(result).toEqual({ type: 'no eligible window', courtId: 'c1', reason: 'Court is reserved soon', nextReservationStart: nextRes });
    });

    it('allows play now and assigns to queue (any court) if no courts are available', () => {
      const result = evaluateRfidScan(activeMember, now, 60, [], [], undefined);
      expect(result).toEqual({ type: 'play now', courtId: 'any', duration: 60, capped: false });
    });
  });

  describe('evaluateGuestReference', () => {
    const now = new Date('2026-08-30T10:00:00Z');

    it('rejects invalid or missing references', () => {
      expect(evaluateGuestReference(null, now).type).toBe('invalid reference');
    });

    it('rejects expired or rejected requests', () => {
      const req: PolicyGuestRequest = {
        id: 'r1', referenceCode: '123', courtId: 'c1', status: 'Expired', paymentStatus: 'Not Required', startTime: now, duration: 60
      };
      expect(evaluateGuestReference(req, now).type).toBe('invalid reference');
    });

    it('returns pending payment for unconfirmed bookings with pending payments', () => {
      const req: PolicyGuestRequest = {
        id: 'r1', referenceCode: '123', courtId: 'c1', status: 'Pending Confirmation', paymentStatus: 'Pending', startTime: now, duration: 60
      };
      expect(evaluateGuestReference(req, now).type).toBe('guest payment pending');
    });

    it('returns pending payment for confirmed bookings with pending payments', () => {
      const req: PolicyGuestRequest = {
        id: 'r1', referenceCode: '123', courtId: 'c1', status: 'Confirmed', paymentStatus: 'Pending', startTime: now, duration: 60
      };
      expect(evaluateGuestReference(req, now).type).toBe('guest payment pending');
    });

    it('allows valid check-in for confirmed, paid bookings within the time window', () => {
      const req: PolicyGuestRequest = {
        id: 'r1', referenceCode: '123', courtId: 'c1', status: 'Confirmed', paymentStatus: 'Confirmed', startTime: new Date('2026-08-30T10:10:00Z'), duration: 60
      };
      expect(evaluateGuestReference(req, now)).toEqual({
        type: 'guest check-in confirmed',
        requestId: 'r1',
        courtId: 'c1',
        startTime: req.startTime,
        duration: 60
      });
    });

    it('rejects no-shows (past grace period)', () => {
      // Game started at 09:30, grace period is 15 mins. It is now 10:00.
      const req: PolicyGuestRequest = {
        id: 'r1', referenceCode: '123', courtId: 'c1', status: 'Confirmed', paymentStatus: 'Confirmed', startTime: new Date('2026-08-30T09:30:00Z'), duration: 60
      };
      const result = evaluateGuestReference(req, now);
      expect(result.type).toBe('invalid reference');
      expect((result as any).reason).toContain('no-show');
    });
  });
});
