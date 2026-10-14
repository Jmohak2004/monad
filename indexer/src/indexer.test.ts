import { describe, it } from "vitest";
import { createTestIndexer, TestHelpers } from "envio";

const { Addresses } = TestHelpers;
const CHAIN = 10143;

describe("ClaimEscrow", () => {
  it("tracks a link from created to claimed", async (t) => {
    const indexer = createTestIndexer();
    const [claimKey, sender, recipient] = Addresses.mockAddresses.map((a) => a.toLowerCase() as `0x${string}`);

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: "ClaimEscrow",
              event: "Created",
              params: { claimKey: claimKey!, sender: sender!, amount: 200_000_000n, expiry: 1_900_000_000n },
            },
          ],
        },
      },
    });

    const created = await indexer.Transfer.getOrThrow(claimKey!);
    t.expect(created.status).toBe("PENDING");
    t.expect(created.sender).toBe(sender);
    t.expect(created.amount).toBe(200_000_000n);

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: "ClaimEscrow",
              event: "Claimed",
              params: { claimKey: claimKey!, recipient: recipient!, sender: sender!, amount: 200_000_000n },
            },
          ],
        },
      },
    });

    const claimed = await indexer.Transfer.getOrThrow(claimKey!);
    t.expect(claimed.status).toBe("CLAIMED");
    t.expect(claimed.recipient).toBe(recipient);

    const senderAcct = await indexer.Account.getOrThrow(sender!);
    const recipientAcct = await indexer.Account.getOrThrow(recipient!);
    t.expect({ sent: senderAcct.sentTotal, received: recipientAcct.receivedTotal }).toEqual({
      sent: 200_000_000n,
      received: 200_000_000n,
    });
  });

  it("marks a link refunded", async (t) => {
    const indexer = createTestIndexer();
    const [claimKey, sender] = Addresses.mockAddresses.map((a) => a.toLowerCase() as `0x${string}`);

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: "ClaimEscrow",
              event: "Created",
              params: { claimKey: claimKey!, sender: sender!, amount: 5_000_000n, expiry: 1_900_000_000n },
            },
            {
              contract: "ClaimEscrow",
              event: "Refunded",
              params: { claimKey: claimKey!, sender: sender!, amount: 5_000_000n },
            },
          ],
        },
      },
    });

    const t1 = await indexer.Transfer.getOrThrow(claimKey!);
    t.expect(t1.status).toBe("REFUNDED");
    t.expect((await indexer.Account.getOrThrow(sender!)).refundedTotal).toBe(5_000_000n);
  });
});

describe("PaymentRequest", () => {
  it("records a paid request for both sides and a cancelled one", async (t) => {
    const indexer = createTestIndexer();
    const [payee, payer] = Addresses.mockAddresses.map((a) => a.toLowerCase() as `0x${string}`);
    const paidId = `0x${"11".repeat(32)}` as const;
    const cancelledId = `0x${"22".repeat(32)}` as const;

    await indexer.process({
      chains: {
        [CHAIN]: {
          simulate: [
            {
              contract: "PaymentRequest",
              event: "RequestPaid",
              params: { id: paidId, payee: payee!, payer: payer!, amount: 200_000_000n },
            },
            { contract: "PaymentRequest", event: "RequestCancelled", params: { id: cancelledId, payee: payee! } },
          ],
        },
      },
    });

    const paid = await indexer.Request.getOrThrow(`${payee}-${paidId}`);
    t.expect({ status: paid.status, payer: paid.payer, amount: paid.amount }).toEqual({
      status: "PAID",
      payer,
      amount: 200_000_000n,
    });
    t.expect((await indexer.Request.getOrThrow(`${payee}-${cancelledId}`)).status).toBe("CANCELLED");
    t.expect((await indexer.Account.getOrThrow(payee!)).receivedTotal).toBe(200_000_000n);
    t.expect((await indexer.Account.getOrThrow(payer!)).sentTotal).toBe(200_000_000n);
  });
});
