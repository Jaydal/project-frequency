/**
 * Next.js Instrumentation Hook
 * https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * This file runs ONCE when the Next.js server boots (not during build/static
 * generation). This is the correct place to start background workers that
 * need an active server context (e.g. MQTT, queue processors).
 */
export async function register() {
  // Only run on the server runtime, not during static builds
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // Validate environment variables on startup
  await import('@/lib/env');

  const { startExpiryProcessor } = await import('@/lib/queue/queue-processor');
  const { startBoardPublisher } = await import('@/lib/queue/board-publisher');

  startExpiryProcessor();
  startBoardPublisher();
}
