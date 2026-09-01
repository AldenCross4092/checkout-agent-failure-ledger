import assert from "node:assert/strict";
import test from "node:test";
import { decidePaymentAction, paymentAttemptSchema } from "../src/payment_decision.ts";

test("an approved high-risk payment waits for manual review", () => {
  const attempt = paymentAttemptSchema.parse({
    eventId: "pay_evt_1042",
    checkoutId: "checkout_1042",
    amountMinor: 12900,
    currency: "USD",
    riskScore: 82,
    agentStep: "authorize-payment",
    outcome: "approved"
  });

  assert.deepEqual(decidePaymentAction(attempt), {
    action: "manual_review",
    notify: true,
    reason: "high_risk_payment"
  });
});
