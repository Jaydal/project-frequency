import { createHmac, timingSafeEqual } from 'node:crypto';

const TOKEN_TTL_SECONDS = 10 * 60;

function secret() {
  return process.env.TERMINAL_SESSION_SECRET || process.env.CONTROLLER_API_KEY || '';
}

export function createTerminalMemberToken(memberId: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = Buffer.from(JSON.stringify({ memberId, exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS })).toString('base64url');
  const signature = createHmac('sha256', key).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function getTerminalMemberId(token: string | null, expectedMemberId?: string): string | null {
  const key = secret();
  if (!key || !token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expectedSignature = createHmac('sha256', key).update(payload).digest('base64url');
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { memberId?: string; exp?: number };
    if (!data.memberId || !data.exp || data.exp <= Math.floor(Date.now() / 1000)) return null;
    if (expectedMemberId && data.memberId !== expectedMemberId) return null;
    return data.memberId;
  } catch {
    return null;
  }
}
