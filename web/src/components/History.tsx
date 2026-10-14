"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { buildClaimLink, formatUsd, refund } from "@/lib/escrow";
import { fetchHistory, fetchRequests, type HistoryItem, type HistorySource, type RequestItem } from "@/lib/history";
import { cancelRequest } from "@/lib/requests";
import { useAccount } from "./AccountProvider";
import { shareRequest } from "./RequestCard";

const POLL_MS = 4000;

const STATUS: Record<HistoryItem["status"], { label: string; cls: string }> = {
  pending: { label: "Waiting to be opened", cls: "text-warn" },
  claimed: { label: "Received", cls: "text-accent" },
  refunded: { label: "Returned to you", cls: "text-muted" },
  expired: { label: "Not opened in time", cls: "text-danger" },
};

const REQUEST_STATUS: Record<RequestItem["status"], { label: string; cls: string }> = {
  waiting: { label: "Waiting to be paid", cls: "text-warn" },
  paid: { label: "Paid", cls: "text-accent" },
  cancelled: { label: "Cancelled", cls: "text-muted" },
  expired: { label: "Not paid in time", cls: "text-muted" },
};

const short = (a: Address) => `${a.slice(0, 6)}…${a.slice(-4)}`;

type Row = { kind: "link"; at: number; it: HistoryItem } | { kind: "request"; at: number; r: RequestItem };

export function History({ owner, refreshKey = 0 }: { owner: Address; refreshKey?: number }) {
  const { account } = useAccount();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [source, setSource] = useState<HistorySource>("device");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, reqs] = await Promise.all([fetchHistory(owner), fetchRequests(owner).catch(() => [])]);
      setRows(
        [
          ...h.items.map((it): Row => ({ kind: "link", at: it.createdAt, it })),
          ...reqs.map((r): Row => ({ kind: "request", at: r.createdAt, r })),
        ].sort((a, b) => b.at - a.at),
      );
      setSource(h.source);
    } catch (e) {
      console.warn("history failed", e);
      setRows((prev) => prev ?? []);
    }
  }, [owner]);

  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  async function busy(key: string, fn: () => Promise<unknown>, fail: string) {
    if (!account) return;
    setBusyKey(key);
    try {
      await fn();
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message.split("\n")[0] : fail);
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
      {rows == null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet. Money you request, pay, or receive shows up here.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {rows.map((row) => (row.kind === "link" ? linkRow(row.it) : requestRow(row.r)))}
        </ul>
      )}
    </section>
  );

  function requestRow(r: RequestItem) {
    const s = REQUEST_STATUS[r.status];
    const incoming = r.direction === "requested";
    const who = r.name || (r.counterparty ? short(r.counterparty) : null);
    return (
      <li key={`req:${r.key}`} className="flex items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">
            {incoming ? "Requested" : "Paid request"}
            {incoming
              ? r.counterparty && <span className="text-muted"> · paid by {short(r.counterparty)}</span>
              : who && <span className="text-muted"> · to {who}</span>}
          </div>
          <div className={`text-xs ${s.cls}`}>
            {s.label} · {new Date(r.createdAt * 1000).toLocaleDateString()}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`text-sm font-semibold tabular-nums ${incoming && r.status === "paid" ? "text-accent" : ""}`}>
            {r.status === "paid" ? (incoming ? "+" : "−") : ""}
            {formatUsd(r.amount)}
          </span>
          {r.invoice && (
            <div className="flex gap-3">
              <button className="text-xs text-muted underline" onClick={() => shareRequest(r.invoice!)}>
                Share
              </button>
              <button
                className="text-xs font-medium text-danger underline"
                disabled={!account || busyKey === r.key}
                onClick={() => {
                  if (!confirm(`Cancel this ${formatUsd(r.amount)} request? The QR will stop working.`)) return;
                  busy(r.key, () => cancelRequest(account!.account, r.invoice!.id), "Couldn't cancel the request");
                }}
              >
                {busyKey === r.key ? "Cancelling…" : "Cancel"}
              </button>
            </div>
          )}
        </div>
      </li>
    );
  }

  function linkRow(it: HistoryItem) {
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
              onClick={() => busy(it.claimKey, () => refund(account!.account, it.claimKey), "Couldn't take the money back")}
            >
              {busyKey === it.claimKey ? "Taking back…" : "Take it back"}
            </button>
          )}
        </div>
      </li>
    );
  }
}
