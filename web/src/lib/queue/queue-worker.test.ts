import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { startQueueWorker, stopQueueWorker } from './queue-worker';

vi.mock('./queue-processor', () => ({
  processAllCourts: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/display/publish-all', () => ({
  publishAllDisplays: vi.fn().mockResolvedValue({ ok: true, failed: 0, total: 0 }),
}));

describe('queue-worker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopQueueWorker();
  });

  afterEach(() => {
    stopQueueWorker();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('runs initial pass and periodic intervals', async () => {
    const { processAllCourts } = await import('./queue-processor');
    const { publishAllDisplays } = await import('@/lib/display/publish-all');

    startQueueWorker(5000);
    expect(processAllCourts).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(processAllCourts).toHaveBeenCalledTimes(2);
    expect(publishAllDisplays).toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(5000);
    expect(processAllCourts).toHaveBeenCalledTimes(3);

    stopQueueWorker();
    await vi.advanceTimersByTimeAsync(5000);
    expect(processAllCourts).toHaveBeenCalledTimes(3);
  });
});
