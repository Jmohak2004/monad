import { indexer, type Account } from "envio";

const fields = { transaction: ["hash"], block: ["timestamp"] } as const;

function emptyAccount(id: string): Account {
  return { id, sentCount: 0, sentTotal: 0n, receivedCount: 0, receivedTotal: 0n, refundedTotal: 0n };
}

indexer.onEvent({ contract: "PaymentRequest", event: "RequestPaid", fields }, async ({ event, context }) => {
  const { id, payee, payer, amount } = event.params;
  context.Request.set({
    id: `${payee}-${id}`,
    requestId: id,
    payee,
    payer,
    amount,
    status: "PAID",
    settledAt: BigInt(event.block.timestamp),
    settledTx: event.transaction.hash,
  });

  const to = (await context.Account.get(payee)) ?? emptyAccount(payee);
  context.Account.set({ ...to, receivedCount: to.receivedCount + 1, receivedTotal: to.receivedTotal + amount });
  const from = (await context.Account.get(payer)) ?? emptyAccount(payer);
  context.Account.set({ ...from, sentCount: from.sentCount + 1, sentTotal: from.sentTotal + amount });
});

indexer.onEvent({ contract: "PaymentRequest", event: "RequestCancelled", fields }, async ({ event, context }) => {
  const { id, payee } = event.params;
  context.Request.set({
    id: `${payee}-${id}`,
    requestId: id,
    payee,
    payer: undefined,
    amount: undefined,
    status: "CANCELLED",
    settledAt: BigInt(event.block.timestamp),
    settledTx: event.transaction.hash,
  });
});
