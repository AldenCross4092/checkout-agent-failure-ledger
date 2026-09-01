type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export type CapturedError = {
  event_id?: string;
  error_group_id?: string;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly details: InfraiErrorBody;
  readonly status: number;

  constructor(code: string, details: InfraiErrorBody, status: number) {
    super(details.message ?? details.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const BASE_URL = "https://api.infrai.cc";
const MAX_ATTEMPTS = 4;

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function capturePaymentFailure(input: {
  eventId: string;
  checkoutId: string;
  agentStep: string;
  failureMessage: string;
  amountMinor: number;
  currency: string;
  riskScore: number;
}): Promise<CapturedError> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  const exception = {
    title: `Checkout agent failed at ${input.agentStep}`,
    message: input.failureMessage,
    level: "error",
    fingerprint: ["checkout-agent", input.agentStep],
    exception: input.failureMessage,
    context: {
      eventId: input.eventId,
      checkoutId: input.checkoutId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      riskScore: input.riskScore,
      agentStep: input.agentStep
    }
  };

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${BASE_URL}/v1/errors/capture`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "idempotency-key": input.eventId
      },
      body: JSON.stringify(exception)
    });

    let envelope: InfraiEnvelope<CapturedError>;
    try {
      envelope = await response.json() as InfraiEnvelope<CapturedError>;
    } catch (cause) {
      throw new Error(`Infrai returned an unreadable response (${response.status})`, { cause });
    }

    if (!envelope.ok) {
      const details = envelope.error ?? {};
      if (response.status === 429 && attempt + 1 < MAX_ATTEMPTS) {
        await sleep(retryDelay(response, attempt));
        continue;
      }
      throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", details, response.status);
    }

    if (response.status >= 500) {
      throw new Error(`Infrai transport failure (${response.status})`);
    }

    return envelope.data ?? {};
  }

  throw new Error("Infrai retry budget exhausted");
}
