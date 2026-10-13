"use client";

import { useEffect, useState } from "react";
import { payoutCurrency } from "@/lib/config";
import { allVerified, PROVIDERS, recipientGets, totalCostUsd } from "@/lib/fees";

type Fx = { rate: number; updatedAt: string; source: string };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const local = (n: number) =>
  n.toLocaleString("en-IN", { style: "currency", currency: payoutCurrency, maximumFractionDigits: 0 });

export function FeeComparison({ amountUsd }: { amountUsd: number }) {
  const [fx, setFx] = useState<Fx | null>(null);

  useEffect(() => {
    fetch(`/api/fx?to=${payoutCurrency}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setFx)
      .catch(() => setFx(null));
  }, []);

  if (!amountUsd) return null;

  const rows = [
    { name: "Ghar", fee: 0, gets: fx ? amountUsd * fx.rate : null, speed: "Seconds", highlight: true },
    ...PROVIDERS.map((p) => ({
      name: p.name,
      fee: totalCostUsd(p, amountUsd),
      gets: fx ? recipientGets(p, amountUsd, fx.rate) : null,
      speed: p.speed,
      highlight: false,
    })),
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Service</th>
              <th className="px-3 py-2 text-right font-medium">Total cost</th>
              <th className="px-3 py-2 text-right font-medium">They get</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name} className={r.highlight ? "bg-accent-soft font-semibold" : "border-t border-line"}>
                <td className="px-3 py-2">
                  {r.name}
                  <div className="text-xs font-normal text-muted">{r.speed}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.highlight ? "Free" : usd(r.fee)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.gets == null ? "…" : local(r.gets)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs leading-relaxed text-muted">
        {fx
          ? `1 USD = ${fx.rate.toFixed(2)} ${payoutCurrency} mid-market (${fx.source}, updated ${new Date(fx.updatedAt).toLocaleDateString()}). `
          : "Loading exchange rate… "}
        Ghar delivers digital dollars; the {payoutCurrency} figure is their value at that rate, and cash-out costs
        aren&apos;t included. Total cost includes each provider&apos;s fee and exchange-rate markup.{" "}
        {allVerified ? (
          <>Competitor figures are estimates as of {PROVIDERS[0].checkedOn}.</>
        ) : (
          <span className="text-warn">Competitor figures are unverified placeholders.</span>
        )}{" "}
        Sources:{" "}
        {PROVIDERS.map((p, i) => (
          <span key={p.name}>
            {p.source.startsWith("http") ? (
              <a className="underline" href={p.source} target="_blank" rel="noreferrer">
                {p.name}
              </a>
            ) : (
              p.name
            )}
            {i < PROVIDERS.length - 1 ? ", " : "."}
          </span>
        ))}
      </p>
    </div>
  );
}
