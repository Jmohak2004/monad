"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { buildClaimLink, formatUsd, refund } from "@/lib/escrow";
import { fetchHistory, type HistoryItem, type HistorySource } from "@/lib/history";
import { useAccount } from "./AccountProvider";

const POLL_MS = 4000;

const STATUS: Record<HistoryItem["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting to be opened", cls: "text-warn" },
  claimed: { label: "Received", cls: "text-accent" },
  refunded: { label: "Returned to you", cls: "text-muted" },
  expired: { label: "Not opened in time", cls: "text-danger" },
};

const short = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export function History({ owner, refreshKey = 0 }: { owner: Address; refreshKey?: number }) {
  const { account } = useAccount();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [source, setSource] = useState<HistorySource>("device");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetchHistory(owner);
      setItems(r.items);
      setSource(r.source);
    } catch (e) {
      console.warn("history failed", e);
      setItems((prev) => prev ?? []);
    }
  }, [owner]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  async function takeBack(item: HistoryItem) {
    if (!account) return;
    setBusyKey(item.claimKey);
    try {
      await refund(account.account, item.claimKey);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't take the money back");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="display text-3xl">Activity</h2>
        <span className="text-xs text-muted">{source === "envio" ? "Live" : "On this device"}</span>
      </div>
      {items == null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Money you send or receive shows up here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {items.map((it) => {
            const s = STATUS[it.status];
            const sent = it.direction === "sent";
            return (
              <li key={it.claimKey} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {sent ? "Sent" : "Received"}
                    {it.counterparty && <span className="text-muted"> · {sent ? "to" : "from"} {short(it.counterparty)}</span>}
                  </div>
                  <div className={`text-xs ${sent ? s.cls : "text-accent"}`}>
                    {sent ? s.label : "In your balance"} · {new Date(it.createdAt * 1000).toLocaleDateString()}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={`text-sm font-semibold tabular-nums ${sent ? "" : "text-accent"}`}>
                    {sent ? "−" : "+"}
                    {formatUsd(it.amount)}
                  </span>
                  {sent && it.status === "pending" && it.claimPrivateKey && (
                    <button
                      className="text-xs text-muted underline"
                      onClick={async () => {
                        await navigator.clipboard.writeText(buildClaimLink(it.claimPrivateKey!));
                        setCopiedKey(it.claimKey);
                        setTimeout(() => setCopiedKey(null), 2000);
                      }}
                    >
                      {copiedKey === it.claimKey ? "Copied" : "Copy link"}
                    </button>
                  )}
                  {sent && it.status === "expired" && (
                    <button
                      className="text-xs font-medium text-danger underline"
                      disabled={!account || busyKey === it.claimKey}
                      onClick={() => takeBack(it)}
                    >
                      {busyKey === it.claimKey ? "Taking back…" : "Take it back"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
