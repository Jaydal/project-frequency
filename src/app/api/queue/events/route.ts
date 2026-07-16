import { boardEmitter, BOARD_UPDATE_EVENT } from '@/lib/queue/board-emitter';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('retry: 2000\n\n'));

      const onBoardUpdate = (snapshotJson: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${snapshotJson}\n\n`));
        } catch {
          cleanup();
        }
      };

      boardEmitter.on(BOARD_UPDATE_EVENT, onBoardUpdate);

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'));
        } catch {
          cleanup();
        }
      }, 15_000);

      const cleanup = () => {
        boardEmitter.off(BOARD_UPDATE_EVENT, onBoardUpdate);
        clearInterval(heartbeat);
      };

      request.signal.addEventListener('abort', cleanup);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
    },
  });
}
