// History feed. Primary source is the Envio HyperIndex GraphQL API (see /indexer).
// If the indexer isn't configured, we fall back to links created on this device
// and read their status straight from the contract.

import type { Address, Hex } from "viem";
import { TransferStatus } from "./abi";
import { envioUrl } from "./config";
import { getTransfer } from "./escrow";
import { loadSentLinks } from "./sentLinks";

export type HistoryItem = {
  claimKey: Address;
  direction: "sent" | "received";
  counterparty: Address | null;
  amount: bigint;
  status: "pending" | "claimed" | "refunded" | "expired";
  createdAt: number;
  expiry: number;
  /** Present for links this device created, so the sender can re-share or refund. */
  claimPrivateKey?: Hex;
};

export type HistorySource = "envio" | "device";

type EnvioTransfer = {
  id: string;
  sender: string;
  recipient: string | null;
  amount: string;
  expiry: string;
  status: "PENDING" | "CLAIMED" | "REFUNDED";
  createdAt: string;
};

const QUERY = `
query History($addr: String!) {
  Transfer(
    where: { _or: [{ sender: { _eq: $addr } }, { recipient: { _eq: $addr } }] }
    order_by: { createdAt: desc }
    limit: 50
  ) {
    id sender recipient amount expiry status createdAt
  }
}`;

function displayStatus(status: "pending" | "claimed" | "refunded", expiry: number): HistoryItem["status"] {
  return status === "pending" && expiry < Date.now() / 1000 ? "expired" : status;
}

async function fromEnvio(owner: Address): Promise<HistoryItem[]> {
  const addr = owner.toLowerCase();
  const res = await fetch(envioUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { addr } }),
  });
  const json = (await res.json()) as { data?: { Transfer: EnvioTransfer[] }; errors?: unknown };
  if (!json.data) throw new Error("Envio query failed");

  const keys = new Map(loadSentLinks(owner).map((l) => [l.claimKey.toLowerCase(), l.claimPrivateKey]));
  return json.data.Transfer.map((t) => {
    const sent = t.sender === addr;
    const expiry = Number(t.expiry);
    return {
      claimKey: t.id as Address,
      direction: sent ? "sent" : "received",
      counterparty: (sent ? t.recipient : t.sender) as Address | null,
      amount: BigInt(t.amount),
      status: displayStatus(t.status.toLowerCase() as "pending", expiry),
      createdAt: Number(t.createdAt),
      expiry,
      claimPrivateKey: sent ? keys.get(t.id) : undefined,
    };
  });
}

async function fromDevice(owner: Address): Promise<HistoryItem[]> {
  const links = loadSentLinks(owner);
  return Promise.all(
    links.map(async (l) => {
      const t = await getTransfer(l.claimKey).catch(() => null);
      const s = t?.status;
      const base =
        s === TransferStatus.Claimed ? "claimed" : s === TransferStatus.Refunded ? "refunded" : "pending";
      return {
        claimKey: l.claimKey,
        direction: "sent" as const,
        counterparty: null,
        amount: BigInt(l.amount),
        status: displayStatus(base, l.expiry),
        createdAt: Math.floor(l.createdAt / 1000),
        expiry: l.expiry,
        claimPrivateKey: l.claimPrivateKey,
      };
    }),
  );
}

export async function fetchHistory(owner: Address): Promise<{ items: HistoryItem[]; source: HistorySource }> {
  if (envioUrl) {
    try {
      return { items: await fromEnvio(owner), source: "envio" };
    } catch (e) {
      console.warn("Envio unavailable, using on-device history", e);
    }
  }
  return { items: await fromDevice(owner), source: "device" };
}
