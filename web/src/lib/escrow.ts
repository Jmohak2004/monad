import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { escrowAbi, tokenAbi, TransferStatus } from "./abi";
import { chain, escrowAddress, LINK_EXPIRY_DAYS, rpcUrl, TOKEN_DECIMALS, tokenAddress } from "./config";

export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });

function requireAddresses() {
  if (!escrowAddress || !tokenAddress) {
    throw new Error("App isn't configured: set NEXT_PUBLIC_ESCROW_ADDRESS and NEXT_PUBLIC_TOKEN_ADDRESS.");
  }
  return { escrow: escrowAddress, token: tokenAddress };
}

export const toUnits = (dollars: string) => parseUnits(dollars, TOKEN_DECIMALS);
export const fromUnits = (units: bigint) => Number(formatUnits(units, TOKEN_DECIMALS));
export const formatUsd = (units: bigint) =>
  fromUnits(units).toLocaleString("en-US", { style: "currency", currency: "USD" });

export async function getBalance(owner: Address): Promise<bigint> {
  const { token } = requireAddresses();
  return publicClient.readContract({ address: token, abi: tokenAbi, functionName: "balanceOf", args: [owner] });
}

// Monad charges for the declared gas limit, not gas used, so we estimate and add a
// small buffer instead of letting a wallet pad it.
export async function write(
  account: LocalAccount,
  params: Parameters<typeof publicClient.simulateContract>[0],
): Promise<Hex> {
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  const { request } = await publicClient.simulateContract({ ...params, account });
  const gas = await publicClient.estimateContractGas({ ...params, account } as never);
  const hash = await wallet.writeContract({ ...request, gas: (gas * 12n) / 10n } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction failed");
  return hash;
}

export type CreatedLink = {
  claimKey: Address;
  claimPrivateKey: Hex;
  amount: bigint;
  expiry: number;
  txHash: Hex;
};

/** Locks `amount` in the escrow behind a fresh ephemeral key and returns that key. */
export async function createClaimLink(
  account: LocalAccount,
  amount: bigint,
  onStep?: (step: "approve" | "create") => void,
): Promise<CreatedLink> {
  const { escrow, token } = requireAddresses();
  const claimPrivateKey = generatePrivateKey();
  const claimKey = privateKeyToAccount(claimPrivateKey).address;
  const expiry = Math.floor(Date.now() / 1000) + LINK_EXPIRY_DAYS * 24 * 60 * 60;

  const allowance = await publicClient.readContract({
    address: token,
    abi: tokenAbi,
    functionName: "allowance",
    args: [account.address, escrow],
  });
  if (allowance < amount) {
    onStep?.("approve");
    await write(account, { address: token, abi: tokenAbi, functionName: "approve", args: [escrow, amount] });
  }

  onStep?.("create");
  const txHash = await write(account, {
    address: escrow,
    abi: escrowAbi,
    functionName: "create",
    args: [amount, claimKey, expiry],
  });
  return { claimKey, claimPrivateKey, amount, expiry, txHash };
}

export function buildClaimLink(claimPrivateKey: Hex): string {
  // The key goes in the fragment, which browsers never send to a server.
  return `${window.location.origin}/claim#k=${claimPrivateKey}`;
}

export function parseClaimFragment(hash: string): Hex | null {
  const k = new URLSearchParams(hash.replace(/^#/, "")).get("k");
  return k && /^0x[0-9a-fA-F]{64}$/.test(k) ? (k as Hex) : null;
}

export type OnchainTransfer = {
  sender: Address;
  expiry: number;
  status: TransferStatus;
  amount: bigint;
};

export async function getTransfer(claimKey: Address): Promise<OnchainTransfer> {
  const { escrow } = requireAddresses();
  const [sender, expiry, status, amount] = await publicClient.readContract({
    address: escrow,
    abi: escrowAbi,
    functionName: "transfers",
    args: [claimKey],
  });
  return { sender, expiry: Number(expiry), status: status as TransferStatus, amount };
}

/** Mirrors ClaimEscrow.claimDigest so we don't need an RPC round trip. */
export function claimDigest(claimKey: Address, recipient: Address): Hex {
  const { escrow } = requireAddresses();
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "address" }],
      [escrow, BigInt(chain.id), claimKey, recipient],
    ),
  );
}

/** The ephemeral key authorizes payout to exactly one recipient address. */
export async function signClaim(claimPrivateKey: Hex, recipient: Address) {
  const key = privateKeyToAccount(claimPrivateKey);
  const signature = await key.signMessage({ message: { raw: claimDigest(key.address, recipient) } });
  return { claimKey: key.address, signature };
}

export async function refund(account: LocalAccount, claimKey: Address): Promise<Hex> {
  const { escrow } = requireAddresses();
  return write(account, { address: escrow, abi: escrowAbi, functionName: "refund", args: [claimKey] });
}
