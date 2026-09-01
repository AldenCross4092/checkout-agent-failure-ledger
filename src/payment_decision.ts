import { z } from "zod";

export const paymentAttemptSchema = z.object({
  eventId: z.string().min(1),
  checkoutId: z.string().min(1),
  amountMinor: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  riskScore: z.number().min(0).max(100),
  agentStep: z.string().min(1),
  outcome: z.enum(["approved", "failed"]),
  failureMessage: z.string().min(1).optional()
}).superRefine((attempt, context) => {
  if (attempt.outcome === "failed" && !attempt.failureMessage) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["failureMessage"],
      message: "failureMessage is required for a failed attempt"
    });
  }
});

export type PaymentAttempt = z.infer<typeof paymentAttemptSchema>;

export type PaymentDecision = {
  action: "fulfill" | "manual_review" | "hold";
  notify: boolean;
  reason: string;
};

export function decidePaymentAction(attempt: PaymentAttempt): PaymentDecision {
  if (attempt.outcome === "failed") {
    return {
      action: "hold",
      notify: true,
      reason: "agent_step_failed"
    };
  }

  if (attempt.riskScore >= 70) {
    return {
      action: "manual_review",
      notify: true,
      reason: "high_risk_payment"
    };
  }

  return {
    action: "fulfill",
    notify: false,
    reason: "approved_payment"
  };
}
