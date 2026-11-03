/**
 * Server-sent events from a route handler. `run` gets a `send` function; the stream closes when
 * `run` settles. Errors are sent as an `error` event instead of breaking the connection silently.
 *
 * If the client goes away (tab reload, closed laptop), sends become no-ops and `run` keeps going,
 * so a long agent turn is never cut off halfway by the browser.
 */
export function sseResponse(run: (send: (event: unknown) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let open = true;
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          open = false;
        }
      };
      try {
        await run(send);
      } catch (err) {
        send({ type: "error", text: (err as Error).message });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            /* already closed by the client */
          }
        }
      }
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });
