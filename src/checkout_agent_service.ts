import { createServer } from "node:http";
import { ZodError } from "zod";
import { capturePaymentFailure, InfraiError } from "./infrai_errors.ts";
import { decidePaymentAction, paymentAttemptSchema } from "./payment_decision.ts";

const port = Number(process.env.PORT ?? 3000);

function sendJson(response: import("node:http").ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/checkout-agent/attempt") {
    sendJson(response, 404, { error: "route_not_found" });
    return;
  }

  try {
    const attempt = paymentAttemptSchema.parse(await readJson(request));
    const decision = decidePaymentAction(attempt);
    let auditEvent: { event_id?: string; error_group_id?: string } | null = null;

    if (attempt.outcome === "failed") {
      auditEvent = await capturePaymentFailure({
        eventId: attempt.eventId,
        checkoutId: attempt.checkoutId,
        agentStep: attempt.agentStep,
        failureMessage: attempt.failureMessage!,
        amountMinor: attempt.amountMinor,
        currency: attempt.currency,
        riskScore: attempt.riskScore
      });
    }

    sendJson(response, 200, {
      checkoutId: attempt.checkoutId,
      decision,
      notification: decision.notify ? "risk_team" : "none",
      auditEvent
    });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      sendJson(response, 400, { error: "invalid_payment_attempt" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, message: error.message });
      return;
    }
    sendJson(response, 502, { error: "audit_capture_failed" });
  }
});

server.listen(port, () => {
  console.log(`Checkout agent service listening on http://localhost:${port}`);
});
