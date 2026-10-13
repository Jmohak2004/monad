import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { AuroraError, createDepositAddress, SOURCE_CHAINS, type SourceChain } from "@/lib/server/aurora";

export async function POST(req: Request) {
  const { address, chain } = (await req.json().catch(() => ({}))) as { address?: string; chain?: string };
  if (!address || !isAddress(address)) return NextResponse.json({ error: "address required" }, { status: 400 });
  if (!chain || !(chain in SOURCE_CHAINS)) return NextResponse.json({ error: "unsupported chain" }, { status: 400 });
  try {
    const r = await createDepositAddress(address, chain as SourceChain);
    return NextResponse.json({ depositAddress: r.depositAddress, memo: r.memo });
  } catch (e) {
    console.error("aurora deposit-address failed", e);
    const status = e instanceof AuroraError ? e.status : 502;
    return NextResponse.json({ error: e instanceof Error ? e.message : "Aurora request failed" }, { status });
  }
}
