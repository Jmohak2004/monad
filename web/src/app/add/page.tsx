"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { AuthCard } from "@/components/AuthCard";
import { Header } from "@/components/Header";
import { chain, tokenIsMock } from "@/lib/config";
import { PAY_RETURN_KEY } from "@/lib/requests";

export default function AddMoney() {
  const { account } = useAccount();
  const [returnTo, setReturnTo] = useState<string | null>(null);
  useEffect(() => setReturnTo(sessionStorage.getItem(PAY_RETURN_KEY)), []);

  return (
    <>
      <Header>
        <Link href={returnTo ?? "/"} className="text-sm text-muted underline">
          Back
        </Link>
      </Header>
      <h1 className="display text-4xl">Add money</h1>
      {returnTo && (
        <Link href={returnTo} className="btn btn-secondary w-full">
          Done? Back to the request
        </Link>
      )}
      {!account ? (
        <AuthCard title="Sign in first" subtitle="Add money to your Ghar balance." />
      ) : (
        <>
          <FromAnotherChain address={account.address} />
          {tokenIsMock && chain.testnet && <DemoFaucet address={account.address} />}
        </>
      )}
    </>
  );
}

function DemoFaucet({ address }: { address: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Demo dollars</h2>
        <p className="text-sm text-muted">Test network only: get $250 of play money to try sending.</p>
      </div>
      <button
        className="btn btn-primary"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch("/api/faucet", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address }),
          });
          const json = await res.json().catch(() => ({}));
          setState(res.ok ? "done" : json.error || "Failed");
        }}
      >
        {state === "busy" ? "Adding…" : state === "done" ? "Added $250" : "Get $250 demo dollars"}
      </button>
      {state !== "idle" && state !== "busy" && state !== "done" && <p className="text-sm text-warn">{state}</p>}
    </section>
  );
}

type AuroraInfo = { enabled: boolean; destinationAsset: string; chains: { id: string; name: string }[] };
type AuroraDeposit = { tx_hash: string; amount: string; decimals: number | null; created_at: string };

function FromAnotherChain({ address }: { address: string }) {
  const [info, setInfo] = useState<AuroraInfo | null>(null);
  const [source, setSource] = useState("base");
  const [deposit, setDeposit] = useState<{ address: string; memo?: string } | null>(null);
  const [status, setStatus] = useState<{ received: AuroraDeposit[]; success: AuroraDeposit[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/aurora/chains")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => setInfo(null));
  }, []);

  // Poll Aurora for the deposit until it lands on Monad.
  useEffect(() => {
    if (!deposit) return;
    const poll = () =>
      fetch(`/api/aurora/status?address=${encodeURIComponent(deposit.address)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setStatus(s))
        .catch(() => {});
    poll();
    const t = setInterval(poll, 6000);
    return () => clearInterval(t);
  }, [deposit]);

  if (!info) return null;
  const sourceName = info.chains.find((c) => c.id === source)?.name ?? source;
  const fmt = (d: AuroraDeposit) =>
    d.decimals != null ? (Number(d.amount) / 10 ** d.decimals).toLocaleString() : d.amount;

  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">From another account</h2>
        <p className="text-sm text-muted">
          Have dollars or crypto somewhere else? Send it from {sourceName} and it arrives here as dollars.
        </p>
      </div>
      {!info.enabled ? (
        <p className="bg-warn-soft p-3 text-sm text-warn">
          Not available yet: set <code>AURORA_API_KEY</code> on the server.
        </p>
      ) : (
        <>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Sending from</span>
            <select
              className="input"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setDeposit(null);
                setStatus(null);
              }}
            >
              {info.chains.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          {!deposit ? (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                const res = await fetch("/api/aurora/deposit-address", {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: JSON.stringify({ address, chain: source }),
                });
                const json = await res.json().catch(() => ({}));
                setBusy(false);
                if (!res.ok) return setError(json.error || "Couldn't get a deposit address");
                setDeposit({ address: json.depositAddress, memo: json.memo });
              }}
            >
              {busy ? "Getting address…" : `Get my ${sourceName} deposit address`}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted">Send to this {sourceName} address:</p>
              <button
                className="break-all border border-line bg-bg p-3 text-left font-mono text-sm"
                onClick={async () => {
                  await navigator.clipboard.writeText(deposit.address);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {deposit.address}
                <span className="mt-1 block font-sans text-xs text-muted">{copied ? "Copied" : "Tap to copy"}</span>
              </button>
              {deposit.memo && <p className="text-sm">Memo (required): <code>{deposit.memo}</code></p>}
              <p className="text-xs text-muted">
                This address is yours and you can reuse it. Deposits are converted to {info.destinationAsset} and
                delivered to your Ghar account on Monad.
              </p>
              <DepositProgress status={status} fmt={fmt} />
            </div>
          )}
          {chain.testnet && (
            <p className="text-xs text-muted">
              Note: Aurora delivers real {info.destinationAsset} on Monad mainnet. This build is on testnet, so
              those deposits won&apos;t show in the balance above.
            </p>
          )}
          {error && <p className="bg-warn-soft p-3 text-sm text-warn">{error}</p>}
        </>
      )}
    </section>
  );
}

function DepositProgress({
  status,
  fmt,
}: {
  status: { received: AuroraDeposit[]; success: AuroraDeposit[] } | null;
  fmt: (d: AuroraDeposit) => string;
}) {
  if (!status) return <p className="text-sm text-muted">Waiting for your deposit…</p>;
  if (status.success.length)
    return (
      <p className="bg-accent-soft p-3 text-sm font-medium text-accent">
        Arrived: {fmt(status.success[0])} added to your balance.
      </p>
    );
  if (status.received.length)
    return <p className="text-sm text-warn">Received {fmt(status.received[0])}. Converting, usually under a minute…</p>;
  return <p className="text-sm text-muted">Waiting for your deposit…</p>;
}
