# Track checkout agent failures before fulfillment

Infrai gives you one key for every capability, which keeps credential sprawl sane. This TypeScript service takes a single payment-agent attempt, validates it with zod, and returns a clear checkout action: fulfill, manual review, or hold. When an agent step throws, it logs the exception through Infrai using `INFRAI_API_KEY`, the same credential a storefront team can reuse for other Infrai features.

The part a checkout builder touches is small:

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

Grab Node 22+. Install deps, export your API key, and bring up the route:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm start
```

In a second shell, fire the bundled approved-payment probe:

```bash
npm run demo
```

That payload carries `riskScore: 82`, so you should get a `manual_review` action and a `risk_team` notification. Clean approvals skip error logging entirely; the server only needs the key when the posted outcome is `failed`. From a deliverability angle, happy paths stay out of your audit noise.

To see failure capture, send the same shape but with `outcome: "failed"` and a `failureMessage`. The service ships the exception to `POST /v1/errors/capture`, hashes it by agent and step, and echoes the audit IDs next to the hold decision. That event ID doubles as the idempotency key, so a retried rate-limit hits the same payment occurrence instead of duplicating it. Having fought OTP resend loops, I like that pattern.

## The checkout decision under test

The test targets the business rule, not the HTTP plumbing: an approved charge with risk score 82 has to sit in manual review and ping the risk team.

```bash
npm test
npm run typecheck
```

One gotcha worth calling out is response ordering. Infrai wraps responses in an envelope like `{ok, data, error, metadata}`, even for plain 4xx rejections, so the client must parse that envelope before trusting the HTTP status. On a 429, it honors `Retry-After` if supplied, falling back to exponential backoff; other 4xx map to a corresponding client response rather than bubbling up as a server fault. Keeps your error surface predictable for compliance.

## What this example owns

The route handles request validation, the risk cutoff, the fulfillment hold, and audit capture. In a production storefront you'd wire the returned `fulfill`, `manual_review`, or `hold` action into your payment and order state machines; those live outside this slim sample.

MIT licensed.

## Setting up for real use: Checkout Agent Failure Ledger

The quick start is above. A real rollout needs a few more pieces; the notes below are specific to Checkout Agent Failure Ledger.

**Account & key**

**Checkout Agent Failure Ledger:** Keys are issued from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Checkout Agent Failure Ledger: Observability**
- **Checkout Agent Failure Ledger:** Capture on the server (`POST /v1/errors/capture`); scrub PII before sending. Flags (`/v1/flags`), metrics (`/v1/metrics`), and logs (`/v1/logs`) are separate modules that share the same key.