// History feed. Primary source is the Envio HyperIndex GraphQL API (see /indexer).
// If the indexer isn't configured, we fall back to links created on this device
// and read their status straight from the contract.

import type { Address, Hex } from "viem";
import { RequestStatus, TransferStatus } from "./abi";
import { envioUrl, requestsConfigured } from "./config";
import { getTransfer } from "./escrow";
import { getRequestStatus, loadPaid, loadRequests, type Invoice } from "./requests";
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

export type RequestItem = {
  /** `${payee}-${requestId}`, lowercase, matching the indexer entity id. */
  key: string;
  /** "requested": I'm the payee. "paid": I paid someone else's request. */
  direction: "requested" | "paid";
  counterparty: Address | null;
  name: string;
  amount: bigint;
  status: "waiting" | "paid" | "cancelled" | "expired";
  createdAt: number;
  /** Present for open requests this device created, so the payee can re-share or cancel. */
  invoice?: Invoice;
};

type EnvioRequest = {
  id: string;
  payee: string;
  payer: string | null;
  amount: string | null;
  status: "PAID" | "CANCELLED";
  settledAt: string;
};

const REQUESTS_QUERY = `
query Requests($addr: String!) {
  Request(
    where: { _or: [{ payee: { _eq: $addr } }, { payer: { _eq: $addr } }] }
    order_by: { settledAt: desc }
    limit: 50
  ) {
    id payee payer amount status settledAt
  }
}`;

const reqKey = (payee: string, id: string) => `${payee}-${id}`.toLowerCase();

async function requestsFromEnvio(owner: Address): Promise<EnvioRequest[]> {
  const res = await fetch(envioUrl!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: REQUESTS_QUERY, variables: { addr: owner.toLowerCase() } }),
  });
  const json = (await res.json()) as { data?: { Request: EnvioRequest[] } };
  if (!json.data) throw new Error("Envio query failed");
  return json.data.Request;
}

/** Requests I made (from this device, status read on-chain) and requests I paid, merged with the indexer. */
export async function fetchRequests(owner: Address): Promise<RequestItem[]> {
  if (!requestsConfigured) return [];
  const now = Date.now() / 1000;
  const items = new Map<string, RequestItem>();

  await Promise.all(
    loadRequests(owner).map(async (inv) => {
      const s = await getRequestStatus(inv.payee, inv.id).catch(() => null);
      const status =
        s === RequestStatus.Paid ? "paid" : s === RequestStatus.Cancelled ? "cancelled" : inv.expiry < now ? "expired" : "waiting";
      items.set(reqKey(inv.payee, inv.id), {
        key: reqKey(inv.payee, inv.id),
        direction: "requested",
        counterparty: null,
        name: inv.name,
        amount: inv.amount,
        status,
        createdAt: Math.floor(inv.createdAt / 1000),
        invoice: status === "waiting" ? inv : undefined,
      });
    }),
  );

  for (const p of loadPaid(owner)) {
    items.set(reqKey(p.payee, p.id), {
      key: reqKey(p.payee, p.id),
      direction: "paid",
      counterparty: p.payee,
      name: p.name,
      amount: p.amount,
      status: "paid",
      createdAt: Math.floor(p.paidAt / 1000),
    });
  }

  if (envioUrl) {
    const addr = owner.toLowerCase();
    for (const r of await requestsFromEnvio(owner).catch(() => [])) {
      const mine = r.payee === addr;
      const existing = items.get(r.id.toLowerCase());
      if (existing) {
        if (mine && r.payer) existing.counterparty = r.payer as Address;
        continue;
      }
      if (r.status !== "PAID") continue; // cancelled requests from another device have no amount to show
      items.set(r.id.toLowerCase(), {
        key: r.id.toLowerCase(),
        direction: mine ? "requested" : "paid",
        counterparty: (mine ? r.payer : r.payee) as Address | null,
        name: "",
        amount: BigInt(r.amount ?? 0),
        status: "paid",
        createdAt: Number(r.settledAt),
      });
    }
  }

  return [...items.values()];
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
