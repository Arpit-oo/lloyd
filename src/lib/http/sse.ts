/**
 * Server-sent events from a route handler. `run` gets a `send` function; the stream closes when
 * `run` settles. Errors are sent as an `error` event instead of breaking the connection silently.
 */
export function sseResponse(run: (send: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      try {
        await run(send);
      } catch (err) {
        send({ type: "error", text: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
