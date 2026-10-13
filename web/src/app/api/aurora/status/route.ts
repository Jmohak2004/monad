import { NextResponse } from "next/server";
import { AuroraError, depositStatus } from "@/lib/server/aurora";

// Combines "received" (seen on the source chain) and "success" (delivered on Monad).
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address");
  if (!address) return NextResponse.json({ error: "address required" }, { status: 400 });
  try {
    const [received, success, failed] = await Promise.all([
      depositStatus(address, "received"),
      depositStatus(address, "success"),
      depositStatus(address, "failed"),
    ]);
    return NextResponse.json({
      received: received.deposits,
      success: success.deposits,
      failed: failed.deposits,
    });
  } catch (e) {
    // 404 just means nothing has been deposited to this address yet.
    if (e instanceof AuroraError && e.status === 404) return NextResponse.json({ received: [], success: [], failed: [] });
    console.error("aurora status failed", e);
    return NextResponse.json({ error: "Couldn't check deposit status" }, { status: 502 });
  }
}
