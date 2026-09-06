import { timingSafeEqual } from 'node:crypto';

type AppMetadata = {
  role?: unknown;
  roles?: unknown;
};

type AuthUser = {
  id?: string;
  app_metadata?: unknown;
  user_metadata?: unknown;
} | null | undefined;

const STAFF_ROLES = new Set(['admin', 'staff', 'operator']);

export function hasStaffRole(user: AuthUser): boolean {
  const metadata = user?.app_metadata;
  if (!metadata || typeof metadata !== 'object') return false;

  const appMetadata = metadata as AppMetadata;
  const roles = Array.isArray(appMetadata.roles) ? appMetadata.roles : [appMetadata.role];
  return roles.some((role) => typeof role === 'string' && STAFF_ROLES.has(role.toLowerCase()));
}

export function isSameMember(user: AuthUser, memberId: string | null | undefined): boolean {
  return Boolean(user?.id && memberId && user.id === memberId);
}

export function hasMatchingApiKey(actual: string | null | undefined, expected: string | null | undefined): boolean {
  if (!actual || !expected) return false;

  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}
