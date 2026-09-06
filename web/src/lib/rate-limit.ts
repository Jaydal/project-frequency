const windows = new Map<string, number>();
const MAX_ENTRIES = 10000;

export function checkRateLimit(key: string, cooldownMs = 60_000): boolean {
  const now = Date.now();
  
  if (windows.size > MAX_ENTRIES) {
    for (const [k, timestamp] of windows.entries()) {
      if (now - timestamp >= cooldownMs) windows.delete(k);
    }
  }

  const last = windows.get(key);
  if (last && now - last < cooldownMs) return false;
  
  windows.set(key, now);
  return true;
}

type WindowEntry = {
  count: number;
  resetAt: number;
};
const counters = new Map<string, WindowEntry>();

export function checkWindowRateLimit(key: string, maxRequests = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  if (counters.size > MAX_ENTRIES) {
    for (const [k, entry] of counters.entries()) {
      if (now >= entry.resetAt) counters.delete(k);
    }
  }

  const entry = counters.get(key);
  if (!entry || now >= entry.resetAt) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count += 1;
  return true;
}

