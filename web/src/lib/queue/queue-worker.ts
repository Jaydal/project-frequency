import { processAllCourts } from './queue-processor';
import { publishAllDisplays } from '@/lib/display/publish-all';

const g = global as typeof globalThis & {
  _queueWorkerStarted?: boolean;
  _queueWorkerInterval?: NodeJS.Timeout;
};

/**
 * Starts the server-side queue processor background worker.
 * Runs every 10 seconds to auto-complete expired games, promote queued players,
 * update lights, and broadcast board changes over MQTT and SSE.
 */
export function startQueueWorker(intervalMs = 10_000): void {
  if (g._queueWorkerStarted) return;
  g._queueWorkerStarted = true;

  // Initial pass on boot
  processAllCourts()
    .then(() => publishAllDisplays())
    .catch((err) => console.error('[queue-worker] Initial reconciliation error:', err));

  g._queueWorkerInterval = setInterval(async () => {
    try {
      await processAllCourts();
      await publishAllDisplays();
    } catch (err) {
      console.error('[queue-worker] Periodic tick error:', err);
    }
  }, intervalMs);

  // Unref the timer so it does not block Node process exit if invoked in worker threads
  if (typeof g._queueWorkerInterval.unref === 'function') {
    g._queueWorkerInterval.unref();
  }

  console.log(`[queue-worker] Background worker started (interval: ${intervalMs}ms)`);
}

export function stopQueueWorker(): void {
  if (g._queueWorkerInterval) {
    clearInterval(g._queueWorkerInterval);
    g._queueWorkerInterval = undefined;
  }
  g._queueWorkerStarted = false;
}
