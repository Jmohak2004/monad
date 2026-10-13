import { NextResponse } from "next/server";

// Mid-market USD rates from a free public API (exchangerate-api.com's open tier,
// which updates daily). Cached for an hour on the server.
const SOURCE = "https://open.er-api.com/v6/latest/USD";

export const revalidate = 3600;

export async function GET(req: Request) {
  const to = (new URL(req.url).searchParams.get("to") || "INR").toUpperCase();
  try {
    const res = await fetch(SOURCE, { next: { revalidate } });
    const data = (await res.json()) as { result: string; rates: Record<string, number>; time_last_update_utc: string };
    const rate = data.rates?.[to];
    if (data.result !== "success" || !rate) throw new Error(`no rate for ${to}`);
    return NextResponse.json({
      base: "USD",
      to,
      rate,
      updatedAt: data.time_last_update_utc,
      source: "exchangerate-api.com",
    });
  } catch (e) {
    console.error("fx failed", e);
    return NextResponse.json({ error: "Exchange rate unavailable" }, { status: 502 });
  }
}
