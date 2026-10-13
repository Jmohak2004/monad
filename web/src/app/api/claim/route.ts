import { NextResponse } from "next/server";
import { isAddress, isHex, recoverMessageAddress, type Address, type Hex } from "viem";
import { escrowAbi, TransferStatus } from "@/lib/abi";
import { escrowAddress } from "@/lib/config";
import { claimDigest, getTransfer, publicClient } from "@/lib/escrow";
import { rateLimited, relayer } from "@/lib/server/relayer";

// Gasless claim relayer. The recipient's browser signs (escrow, chain, claimKey,
// recipient) with the link's ephemeral key; we check it and pay the gas to submit.
// The relayer can't redirect funds: the signature only pays out to `recipient`.
export async function POST(req: Request) {
  let body: { claimKey?: string; recipient?: string; signature?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { claimKey, recipient, signature } = body;
  if (!claimKey || !isAddress(claimKey) || !recipient || !isAddress(recipient) || !signature || !isHex(signature)) {
    return NextResponse.json({ error: "claimKey, recipient, and signature are required" }, { status: 400 });
  }
  if (!escrowAddress) return NextResponse.json({ error: "Escrow not configured" }, { status: 500 });
  if (rateLimited(`claim:${claimKey.toLowerCase()}`, 5_000)) {
    return NextResponse.json({ error: "Claim already in progress" }, { status: 429 });
  }

  // Check everything off-chain first so bad requests don't cost the relayer gas.
  const signer = await recoverMessageAddress({
    message: { raw: claimDigest(claimKey as Address, recipient as Address) },
    signature: signature as Hex,
  });
  if (signer.toLowerCase() !== claimKey.toLowerCase()) {
    return NextResponse.json({ error: "Signature doesn't match this link" }, { status: 400 });
  }
  const transfer = await getTransfer(claimKey as Address);
  if (transfer.status !== TransferStatus.Pending) {
    return NextResponse.json({ error: "This link has already been used", status: transfer.status }, { status: 409 });
  }
  if (transfer.expiry < Date.now() / 1000) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  try {
    const wallet = relayer();
    const args = [claimKey as Address, recipient as Address, signature as Hex] as const;
    const { request } = await publicClient.simulateContract({
      account: wallet.account,
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "claim",
      args,
    });
    const gas = await publicClient.estimateContractGas({
      account: wallet.account,
      address: escrowAddress,
      abi: escrowAbi,
      functionName: "claim",
      args,
    });
    const hash = await wallet.writeContract({ ...request, gas: (gas * 12n) / 10n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error("Claim transaction reverted");
    return NextResponse.json({ hash });
  } catch (e) {
    console.error("claim relay failed", e);
    return NextResponse.json({ error: "Couldn't complete the claim. Please try again." }, { status: 502 });
  }
}
