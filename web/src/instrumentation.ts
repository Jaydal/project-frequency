export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  await import('@/lib/env');
  const { startQueueWorker } = await import('@/lib/queue/queue-worker');
  startQueueWorker();
}
