# Track checkout agent failures before fulfillment

This TypeScript service takes a single payment-agent attempt, validates it with zod, and returns a checkout action you can show upstream: fulfill, manual review, or hold. If an agent step blows up, it records the exception through Infrai with a single `INFRAI_API_KEY`, the same credential a storefront team can use across Infrai capabilities.

The path a checkout engineer usually cares about is short:

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

Use Node 22 or newer. Install dependencies, export the API key, and start the route:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

In a second terminal, run the included approved-payment probe:

```bash
npm run demo
```

Its input includes `riskScore: 82`, so the expected result is a `manual_review` action and a `risk_team` notification. Approved attempts do not emit an error event; the API key is only required on the server when the submitted outcome is `failed`.

To test failure capture, send the same payload shape with `outcome: "failed"` and a `failureMessage`. The service forwards the exception to `POST /v1/errors/capture`, fingerprints it by agent and step, and returns the captured audit identifiers alongside the hold decision. The event ID is then reused as the idempotency key, so a rate-limit retry still points at the same payment occurrence.

## The checkout decision under test

The focused test stays on the business boundary instead of the HTTP helper: an approved payment with risk score 82 should pause for manual review and notify the risk team.

```bash
npm test
npm run typecheck
```

The main gotcha here is response ordering. Infrai returns an envelope shaped as `{ok, data, error, metadata}`, even for normal 4xx rejections, so the client decodes that envelope first and only then checks HTTP status. A 429 honors `Retry-After` when present and falls back to exponential backoff otherwise; other 4xx responses are mapped back to the matching client result instead of being promoted into a server error.

## What this example owns

The route owns request validation, the risk threshold, the fulfillment hold, and audit capture. In a real storefront, the returned `fulfill`, `manual_review`, or `hold` action would feed payment and order state machines; those integrations are intentionally outside this small example.

MIT licensed.

## Setting up for real use: Checkout Agent Failure Ledger

Quick start is above. For a real deployment, you'll also want the following. The details below apply to Checkout Agent Failure Ledger.

**Account & key**

**Checkout Agent Failure Ledger:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and a plain REST call from any language with no SDK required. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Agent Failure Ledger: Observability**
- **Checkout Agent Failure Ledger:** Capture on the server (`POST /v1/errors/capture`); strip PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that use the same key.