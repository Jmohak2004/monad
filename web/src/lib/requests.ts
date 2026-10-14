// One-time payment requests ("I need $200"). The payee signs an invoice with their
// passkey account, with no transaction, and shares it as a QR / link. Whoever opens it
// pays it once from their own balance via PaymentRequest.sol.

import { encodeAbiParameters, keccak256, toHex, type Address, type Hex, type LocalAccount } from "viem";
import { requestsAbi, RequestStatus, tokenAbi } from "./abi";
import { chain, REQUEST_EXPIRY_DAYS, requestsAddress, tokenAddress } from "./config";
import { publicClient, write } from "./escrow";

/** sessionStorage key: the pay page a short-on-balance payer should return to after Add money. */
export const PAY_RETURN_KEY = "ghar.pay.return";

export type Invoice = {
  payee: Address;
  amount: bigint;
  id: Hex;
  expiry: number;
  signature: Hex;
  /** Display name of the payee. Not signed: the payee address is what gets paid. */
  name: string;
};

function requireAddresses() {
  if (!requestsAddress || !tokenAddress) {
    throw new Error("Requests aren't configured: set NEXT_PUBLIC_REQUESTS_ADDRESS and NEXT_PUBLIC_TOKEN_ADDRESS.");
  }
  return { requests: requestsAddress, token: tokenAddress };
}

/** Mirrors PaymentRequest.requestDigest. */
export function requestDigest(payee: Address, amount: bigint, id: Hex, expiry: number): Hex {
  const { requests } = requireAddresses();
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "uint256" }, { type: "bytes32" }, { type: "uint40" }],
      [requests, BigInt(chain.id), payee, amount, id, expiry],
    ),
  );
}

export async function createRequest(account: LocalAccount, amount: bigint, name: string): Promise<Invoice> {
  const id = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const expiry = Math.floor(Date.now() / 1000) + REQUEST_EXPIRY_DAYS * 24 * 60 * 60;
  const signature = await account.signMessage({ message: { raw: requestDigest(account.address, amount, id, expiry) } });
  return { payee: account.address, amount, id, expiry, signature, name };
}

export function buildPayLink(inv: Invoice): string {
  const q = new URLSearchParams({
    p: inv.payee,
    a: inv.amount.toString(),
    i: inv.id,
    e: String(inv.expiry),
    s: inv.signature,
    n: inv.name,
  });
  // Query string, not a hash. WhatsApp and share sheets drop everything after #,
  // so the opened page had no invoice and showed "This QR doesn't work".
  return `${window.location.origin}/pay?${q}`;
}

export function parsePayFragment(hash: string): Invoice | null {
  const q = new URLSearchParams(hash.replace(/^[?#]/, ""));
  const [p, a, i, e, s] = ["p", "a", "i", "e", "s"].map((k) => q.get(k) ?? "");
  if (!/^0x[0-9a-fA-F]{40}$/.test(p) || !/^[1-9][0-9]{0,30}$/.test(a) || !/^0x[0-9a-fA-F]{64}$/.test(i)) return null;
  if (!/^[0-9]{1,12}$/.test(e) || !/^0x[0-9a-fA-F]{130}$/.test(s)) return null;
  return {
    payee: p as Address,
    amount: BigInt(a),
    id: i as Hex,
    expiry: Number(e),
    signature: s as Hex,
    name: (q.get("n") ?? "").slice(0, 40),
  };
}

export async function getRequestStatus(payee: Address, id: Hex): Promise<RequestStatus> {
  const { requests } = requireAddresses();
  const s = await publicClient.readContract({ address: requests, abi: requestsAbi, functionName: "status", args: [payee, id] });
  return s as RequestStatus;
}

export async function payRequest(
  account: LocalAccount,
  inv: Invoice,
  onStep?: (step: "approve" | "pay") => void,
): Promise<Hex> {
  const { requests, token } = requireAddresses();
  const allowance = await publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "allowance",
    args: [account.address, requests],
  });
  if (allowance < inv.amount) {
    onStep?.("approve");
    await write(account, { address: token, abi: tokenAbi, functionName: "approve", args: [requests, inv.amount] });
  }
  onStep?.("pay");
  return write(account, {
    address: requests,
    abi: requestsAbi,
    functionName: "pay",
    args: [inv.payee, inv.amount, inv.id, inv.expiry, inv.signature],
  });
}

export async function cancelRequest(account: LocalAccount, id: Hex): Promise<Hex> {
  const { requests } = requireAddresses();
  return write(account, { address: requests, abi: requestsAbi, functionName: "cancel", args: [id] });
}

// Requests this device created. Unpaid ones only exist here, so the payee can
// re-share or cancel them; paid ones also show up from the indexer.
type SavedRequest = Omit<Invoice, "amount"> & { amount: string; createdAt: number };
export type StoredRequest = Invoice & { createdAt: number };

const key = (payee: Address) => `ghar.requests.v1:${payee.toLowerCase()}`;

export function loadRequests(payee: Address): StoredRequest[] {
  try {
    const all = JSON.parse(localStorage.getItem(key(payee)) || "[]") as SavedRequest[];
    return all.map((r) => ({ ...r, amount: BigInt(r.amount) }));
  } catch {
    return [];
  }
}

// Requests this device paid, so the payer sees them before the indexer is up.
export type PaidRequest = { payee: Address; id: Hex; amount: bigint; name: string; paidAt: number };
const paidKey = (payer: Address) => `ghar.paid.v1:${payer.toLowerCase()}`;

export function loadPaid(payer: Address): PaidRequest[] {
  try {
    const all = JSON.parse(localStorage.getItem(paidKey(payer)) || "[]") as (Omit<PaidRequest, "amount"> & { amount: string })[];
    return all.map((r) => ({ ...r, amount: BigInt(r.amount) }));
  } catch {
    return [];
  }
}

export function savePaid(payer: Address, inv: Invoice) {
  try {
    const entry = { payee: inv.payee, id: inv.id, amount: inv.amount.toString(), name: inv.name, paidAt: Date.now() };
    const rest = JSON.parse(localStorage.getItem(paidKey(payer)) || "[]") as { id: string }[];
    localStorage.setItem(paidKey(payer), JSON.stringify([entry, ...rest.filter((r) => r.id !== inv.id)]));
  } catch {}
}

export function saveRequest(inv: Invoice) {
  try {
    const all = JSON.parse(localStorage.getItem(key(inv.payee)) || "[]") as SavedRequest[];
    const entry: SavedRequest = { ...inv, amount: inv.amount.toString(), createdAt: Date.now() };
    localStorage.setItem(key(inv.payee), JSON.stringify([entry, ...all.filter((r) => r.id !== inv.id)]));
  } catch {}
}
