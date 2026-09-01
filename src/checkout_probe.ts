const response = await fetch("http://localhost:3000/checkout-agent/attempt", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    eventId: "pay_evt_1042",
    checkoutId: "checkout_1042",
    amountMinor: 12900,
    currency: "USD",
    riskScore: 82,
    agentStep: "authorize-payment",
    outcome: "approved"
  })
});

console.log(await response.json());
