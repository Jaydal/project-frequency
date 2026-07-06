type Viewer = { courtId: string; seenAt: number };

const g = global as typeof globalThis & { _displayViewers?: Map<string, Viewer> };
if (!g._displayViewers) g._displayViewers = new Map();

export function getViewerCounts(): Record<string, number> {
  const now = Date.now();
  const cutoff = now - 12_000;
  const counts: Record<string, number> = {};
  for (const [, v] of g._displayViewers!) {
    if (v.seenAt < cutoff) continue;
    counts[v.courtId] = (counts[v.courtId] ?? 0) + 1;
  }
  return counts;
}
