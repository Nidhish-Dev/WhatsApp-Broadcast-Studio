import { NextRequest } from 'next/server';
import { whatsappManager } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Trigger client initialization in background if not already running
  whatsappManager.initialize();

  const responseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
  };

  const stream = new ReadableStream({
    start(controller) {
      // Helper to send JSON events
      const sendEvent = (data: any) => {
        controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
      };

      // Register listener in the singleton
      const listener = (data: any) => {
        try {
          sendEvent(data);
        } catch (err) {
          console.error('SSE send error, client might have disconnected:', err);
        }
      };

      whatsappManager.addListener(listener);

      // Send a heartbeat comment every 15s to keep connection alive
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(': heartbeat\n\n');
        } catch (err) {
          clearInterval(heartbeatInterval);
        }
      }, 15000);

      // Clean up when client disconnects
      req.signal.addEventListener('abort', () => {
        console.log('SSE connection aborted, cleaning up listeners');
        whatsappManager.removeListener(listener);
        clearInterval(heartbeatInterval);
        try {
          controller.close();
        } catch (err) {
          // Stream might be closed already
        }
      });
    }
  });

  return new Response(stream, { headers: responseHeaders });
}
