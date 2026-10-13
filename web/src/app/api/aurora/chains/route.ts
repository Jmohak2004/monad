import { NextResponse } from "next/server";
import { destinationAsset, SOURCE_CHAINS } from "@/lib/server/aurora";

export function GET() {
  return NextResponse.json({
    enabled: Boolean(process.env.AURORA_API_KEY),
    destinationAsset: destinationAsset(),
    chains: Object.entries(SOURCE_CHAINS).map(([id, name]) => ({ id, name })),
  });
}
