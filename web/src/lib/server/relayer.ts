import "server-only";
import { createWalletClient, http, type Hex } from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { chain, rpcUrl } from "../config";

let cached: ReturnType<typeof build> | null = null;

function build(pk: Hex) {
  const account = privateKeyToAccount(pk, { nonceManager });
  return createWalletClient({ account, chain, transport: http(rpcUrl) });
}

/** Server-side wallet that pays gas on behalf of recipients. */
export function relayer() {
  const pk = process.env.RELAYER_PRIVATE_KEY as Hex | undefined;
  if (!pk) throw new Error("RELAYER_PRIVATE_KEY is not set");
  cached ??= build(pk);
  return cached;
}

/** Tiny in-memory rate limiter; good enough for a single-instance demo. */
const hits = new Map<string, number>();
export function rateLimited(key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = hits.get(key);
  if (last && now - last < windowMs) return true;
  hits.set(key, now);
  return false;
}
