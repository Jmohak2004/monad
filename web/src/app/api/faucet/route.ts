import { NextResponse } from "next/server";
import { isAddress, parseEther, type Address } from "viem";
import { monadTestnet } from "viem/chains";
import { tokenAbi } from "@/lib/abi";
import { chain, tokenAddress, tokenIsMock } from "@/lib/config";
import { publicClient, toUnits } from "@/lib/escrow";
import { rateLimited, relayer } from "@/lib/server/relayer";

const DEMO_DOLLARS = "250";
const GAS_TOP_UP = parseEther("0.1");
const MIN_GAS_BALANCE = parseEther("0.05");

// Testnet only: gives a demo sender mock AUSD to send, plus a little MON so their
// passkey account can pay for its own approve + create transactions.
export async function POST(req: Request) {
  if (chain.id !== monadTestnet.id || !tokenIsMock || !tokenAddress) {
    return NextResponse.json({ error: "Faucet is only available on testnet" }, { status: 404 });
  }
  const { address } = (await req.json().catch(() => ({}))) as { address?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "address required" }, { status: 400 });
  if (rateLimited(`faucet:${address.toLowerCase()}`, 10 * 60_000)) {
    return NextResponse.json({ error: "Demo funds were sent recently. Try again in a few minutes." }, { status: 429 });
  }

  try {
    const wallet = relayer();
    const mint = await wallet.writeContract({
      address: tokenAddress,
      abi: tokenAbi,
      functionName: "faucet",
      args: [address as Address, toUnits(DEMO_DOLLARS)],
    });
    let gasTx: string | undefined;
    if ((await publicClient.getBalance({ address: address as Address })) < MIN_GAS_BALANCE) {
      gasTx = await wallet.sendTransaction({ to: address as Address, value: GAS_TOP_UP });
    }
    await publicClient.waitForTransactionReceipt({ hash: mint });
    return NextResponse.json({ mint, gasTx });
  } catch (e) {
    console.error("faucet failed", e);
    return NextResponse.json({ error: "Faucet failed" }, { status: 502 });
  }
}
