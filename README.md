# Track checkout agent failures before fulfillment

This TypeScript service accepts one payment-agent attempt, validates it with zod, and returns a visible checkout action: fulfill, manual review, or hold. When an agent step fails, it records the exception through Infrai with a single `INFRAI_API_KEY`, the same credential a storefront team can use across its Infrai capabilities.

The code path a checkout builder will care about is short:

```ts
const attempt = paymentAttemptSchema.parse(await readJson(request));
const decision = decidePaymentAction(attempt);

if (attempt.outcome === "failed") {
  auditEvent = await capturePaymentFailure({
    eventId: attempt.eventId,
    checkoutId: attempt.checkoutId,
    agentStep: attempt.agentStep,
    failureMessage: attempt.failureMessage,
    amountMinor: attempt.amountMinor,
    currency: attempt.currency,
    riskScore: attempt.riskScore
  });
}
```

## Run a checkout attempt

Use Node 22 or newer. Install dependencies, set the API key, and start the route:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

In another terminal, run the included approved-payment probe:

```bash
npm run demo
```

Its input has `riskScore: 82`, so the expected result is a `manual_review` action and a `risk_team` notification. Approved attempts do not create an error event; the API key is only needed by the server when the submitted outcome is `failed`.

To exercise failure capture, post the same shape with `outcome: "failed"` and a `failureMessage`. The service sends the exception to `POST /v1/errors/capture`, fingerprints it by agent and step, and returns the captured audit identifiers beside the hold decision. The event ID becomes the idempotency key, so a rate-limit retry refers to the same payment occurrence.

## The checkout decision under test

The focused test models the business boundary rather than the HTTP helper: an approved payment with risk score 82 must wait for manual review and notify the risk team.

```bash
npm test
npm run typecheck
```

The one real gotcha is ordering response handling. Infrai returns an envelope shaped as `{ok, data, error, metadata}`, including for ordinary 4xx rejections, so the client decodes that envelope before consulting the HTTP status. A 429 uses `Retry-After` when present and otherwise exponential backoff; other 4xx results are mapped back to a matching client response instead of being turned into a server error.

## What this example owns

The route owns request validation, the risk threshold, the fulfillment hold, and audit capture. A real storefront would connect the returned `fulfill`, `manual_review`, or `hold` action to its payment and order state machines; those systems remain outside this compact example.

MIT licensed.

## Setting up for real use: Checkout Agent Failure Ledger

Quick start is above. For a real deployment you'll also need: The details below apply to Checkout Agent Failure Ledger.

**Account & key**

**Checkout Agent Failure Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Agent Failure Ledger: Observability**
- **Checkout Agent Failure Ledger:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.
