import { describe, expect, it } from 'vitest';
import {
  hasStaffRole,
  isSameMember,
  hasMatchingApiKey,
} from './authorization';

describe('authorization helpers', () => {
  it('accepts only staff roles from app metadata', () => {
    expect(hasStaffRole({ app_metadata: { role: 'staff' } })).toBe(true);
    expect(hasStaffRole({ app_metadata: { roles: ['admin'] } })).toBe(true);
    expect(hasStaffRole({ user_metadata: { role: 'admin' } })).toBe(false);
    expect(hasStaffRole({ app_metadata: { role: 'member' } })).toBe(false);
    expect(hasStaffRole(null)).toBe(false);
  });

  it('allows a member to act only on their own member identifier', () => {
    expect(isSameMember({ id: 'member-1' }, 'member-1')).toBe(true);
    expect(isSameMember({ id: 'member-1' }, 'member-2')).toBe(false);
    expect(isSameMember(null, 'member-1')).toBe(false);
  });

  it('compares controller keys without accepting missing or unequal keys', () => {
    expect(hasMatchingApiKey('secret', 'secret')).toBe(true);
    expect(hasMatchingApiKey('secret', 'wrong')).toBe(false);
    expect(hasMatchingApiKey(undefined, 'secret')).toBe(false);
    expect(hasMatchingApiKey('secret', undefined)).toBe(false);
    expect(hasMatchingApiKey('', '')).toBe(false);
  });
});
