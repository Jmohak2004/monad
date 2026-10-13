import { indexer, type Account, type Transfer } from "envio";

const fields = { transaction: ["hash"], block: ["timestamp"] } as const;

function emptyAccount(id: string): Account {
  return { id, sentCount: 0, sentTotal: 0n, receivedCount: 0, receivedTotal: 0n, refundedTotal: 0n };
}

indexer.onEvent({ contract: "ClaimEscrow", event: "Created", fields }, async ({ event, context }) => {
  const { claimKey, sender, amount, expiry } = event.params;

  const transfer: Transfer = {
    id: claimKey,
    sender,
    recipient: undefined,
    amount,
    expiry,
    status: "PENDING",
    createdAt: BigInt(event.block.timestamp),
    createdTx: event.transaction.hash,
    settledAt: undefined,
    settledTx: undefined,
  };
  context.Transfer.set(transfer);

  const account = (await context.Account.get(sender)) ?? emptyAccount(sender);
  context.Account.set({ ...account, sentCount: account.sentCount + 1, sentTotal: account.sentTotal + amount });
});

indexer.onEvent({ contract: "ClaimEscrow", event: "Claimed", fields }, async ({ event, context }) => {
  const { claimKey, recipient, amount } = event.params;

  const existing = await context.Transfer.get(claimKey);
  if (!existing) {
    context.log.warn(`Claimed for unknown transfer ${claimKey}`);
    return;
  }
  context.Transfer.set({
    ...existing,
    recipient,
    status: "CLAIMED",
    settledAt: BigInt(event.block.timestamp),
    settledTx: event.transaction.hash,
  });

  const account = (await context.Account.get(recipient)) ?? emptyAccount(recipient);
  context.Account.set({
    ...account,
    receivedCount: account.receivedCount + 1,
    receivedTotal: account.receivedTotal + amount,
  });
});

indexer.onEvent({ contract: "ClaimEscrow", event: "Refunded", fields }, async ({ event, context }) => {
  const { claimKey, sender, amount } = event.params;

  const existing = await context.Transfer.get(claimKey);
  if (!existing) {
    context.log.warn(`Refunded for unknown transfer ${claimKey}`);
    return;
  }
  context.Transfer.set({
    ...existing,
    status: "REFUNDED",
    settledAt: BigInt(event.block.timestamp),
    settledTx: event.transaction.hash,
  });

  const account = (await context.Account.get(sender)) ?? emptyAccount(sender);
  context.Account.set({ ...account, refundedTotal: account.refundedTotal + amount });
});
