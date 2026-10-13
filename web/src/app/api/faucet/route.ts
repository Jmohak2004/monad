import { NextResponse } from "next/server";
import { isAddress, parseEther, type Address, type Hex } from "viem";
import { tokenAbi } from "@/lib/abi";
import { chain, tokenAddress, tokenIsMock } from "@/lib/config";
import { publicClient, toUnits } from "@/lib/escrow";
import { rateLimited, relayer } from "@/lib/server/relayer";

const DEMO_DOLLARS = "250";
const GAS_TOP_UP = parseEther("0.1");
const MIN_GAS_BALANCE = parseEther("0.05");
// ponytail: Monad reverts a value transfer that leaves the sender under 10 MON
// unless it is their only tx in the last k=3 blocks (~1.2s). The relayer holds
// under that reserve, so the MON top-up has to be alone in that window.
// Upgrade: fund the relayer above 10 MON and delete the pauses.
const RESERVE_GAP_MS = 2_000;

export const maxDuration = 60;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Testnet only: gives a demo sender mock AUSD to send, plus a little MON so their
// passkey account can pay for its own approve + create transactions.
export async function POST(req: Request) {
  if (!chain.testnet || !tokenIsMock || !tokenAddress) {
    return NextResponse.json({ error: "Faucet is only available on testnet" }, { status: 404 });
  }
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "address required" }, { status: 400 });
  if (rateLimited(`faucet:${address.toLowerCase()}`, 10 * 60_000)) {
    return NextResponse.json({ error: "Demo funds were sent recently. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const wallet = relayer();
    let gasTx: Hex | undefined;
    if ((await publicClient.getBalance({ address: address as Address })) < MIN_GAS_BALANCE) {
      await pause(RESERVE_GAP_MS);
      gasTx = await wallet.sendTransaction({ to: address as Address, value: GAS_TOP_UP });
      const gasReceipt = await publicClient.waitForTransactionReceipt({ hash: gasTx });
      if (gasReceipt.status !== "success") throw new Error("gas top-up reverted");
      await pause(RESERVE_GAP_MS);
    }
    const mint = await wallet.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "faucet",
      args: [address as Address, toUnits(DEMO_DOLLARS)],
    });
    await publicClient.waitForTransactionReceipt({ hash: mint });
    return NextResponse.json({ mint, gasTx });
  } catch (e) {
    console.error("faucet failed", e);
    return NextResponse.json({ error: "Faucet failed" }, { status: 502 });
  }
}
