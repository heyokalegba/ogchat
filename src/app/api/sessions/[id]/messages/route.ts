import type { StreamEvent } from "@/lib/types";
import { ChatRequestError, parseSendInput, prepareTurn, runTurn } from "@/lib/server/chat";
import { guard } from "@/lib/server/guard";
import { BadRequest, errorJson, readBody } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

/**
 * POST /api/sessions/:id/messages
 *   { content, replaceFromMessageId? }   send a message (optionally replacing
 *                                        an earlier user message and what followed)
 *   { regenerate: true }                 retry the reply to the last user message
 *
 * The provider is called with the session's full stored history. The response
 * is an NDJSON stream of StreamEvent lines: start, delta…, then done or error.
 * Failures before the stream starts (unknown session, bad input, session busy)
 * are ordinary JSON error responses.
 */
export async function POST(request: Request, { params }: Context): Promise<Response> {
  const blocked = guard(request);
  if (blocked) return blocked;
  const { id } = await params;

  let turn;
  try {
    turn = prepareTurn(id, parseSendInput(await readBody(request)));
  } catch (err) {
    if (err instanceof ChatRequestError) return errorJson(err.status, err.code, err.message);
    if (err instanceof BadRequest) return errorJson(400, "bad_request", err.message);
    throw err;
  }

  const encoder = new TextEncoder();
  let open = true;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const emit = (event: StreamEvent) => {
        if (!open) return;
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      };
      void runTurn(id, turn, emit).finally(() => {
        if (!open) return;
        open = false;
        controller.close();
      });
    },
    cancel() {
      // The browser went away. The turn carries on and saves its reply;
      // only an explicit POST …/stop ends it early.
      open = false;
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
