import { z } from 'zod';

const memberId = z.string().uuid();
const courtId = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional()
);
const matchTitle = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(120).optional()
);
const start = z.string().datetime({ offset: true });
const duration = z.coerce.number().int().min(15).max(480);
const partySize = z.union([z.literal(2), z.literal(4)]);
const playerIds = z.array(memberId).max(4).optional().default([]);

export const bookingSchema = z.object({
  memberId,
  courtId,
  start,
  duration,
  partySize,
  playerIds,
  matchTitle,
});

export const queueJoinSchema = bookingSchema;

export const queueActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['accept', 'decline']),
});

export const guestBookingRequestSchema = z.object({
  guestName: z.string().trim().min(2).max(120),
  mobileNumber: z.string().trim().regex(/^[+0-9 ()-]{7,24}$/),
  email: z.string().trim().email().max(254).optional().or(z.literal('')),
  courtId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  start,
  duration,
  partySize,
  matchTitle,
  paymentMethod: z.enum(['E-wallet', 'Bank Transfer', 'Walk-in']),
});
