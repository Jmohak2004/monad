import "server-only";

// Aurora Intents: persistent deposit addresses (https://docs.intents.aurora.dev).
// The user sends a supported token on another chain to a deposit address, and
// Aurora delivers `destinationAsset` on Monad to their Ghar account.
const BASE = "https://intents-api.aurora.dev/api";

/** Chains we offer as top-up sources. Values are Aurora's chain aliases. */
export const SOURCE_CHAINS = {
  base: "Base",
  arb: "Arbitrum",
  eth: "Ethereum",
  op: "Optimism",
  pol: "Polygon",
  bsc: "BNB Chain",
  sol: "Solana",
  tron: "Tron",
} as const;
export type SourceChain = keyof typeof SOURCE_CHAINS;

export const destinationAsset = () => process.env.AURORA_DESTINATION_ASSET || "AUSD";

function apiKey() {
  const k = process.env.AURORA_API_KEY;
  if (!k) throw new AuroraError(503, "Aurora isn't configured (AURORA_API_KEY)");
  return encodeURIComponent(k);
}

export class AuroraError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) throw new AuroraError(res.status, `Aurora ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export function createDepositAddress(recipient: string, depositChain: SourceChain) {
  return call<{ depositAddress: string; alreadyExists: boolean; memo?: string; correlationId?: string }>(
    `/persistent-deposit-address/${apiKey()}`,
    {
      method: "POST",
      body: JSON.stringify({
        recipient,
        // Aurora keys the address on (sender, chains, asset); the account address is a stable user id.
        sender: recipient,
        depositChain,
        destinationChain: "monad",
        destinationAsset: destinationAsset(),
      }),
    },
  );
}

export type AuroraDeposit = {
  tx_hash: string;
  fromChain: string | null;
  asset_id: string | null;
  decimals: number | null;
  amount: string;
  created_at: string;
};

export function depositStatus(address: string, type: "received" | "success" | "failed") {
  const q = new URLSearchParams({ type, address, limit: "10" });
  return call<{ deposits: AuroraDeposit[] }>(`/persistent-deposit-status/${apiKey()}?${q}`);
}
